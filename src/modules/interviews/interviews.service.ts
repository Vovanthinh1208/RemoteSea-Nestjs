import { Injectable, Logger } from "@nestjs/common";
import type { CompanyMemberRole } from "@prisma/client";
import { InterviewsRepository } from "./interviews.repository";
import type {
  ApplicationParties,
  InterviewRecord,
  InterviewWithHeader,
  UpcomingInterviewsResult,
} from "./interfaces";
import type { ProposeInterviewDto } from "./dto/propose-interview.dto";
import type { ConfirmInterviewDto } from "./dto/confirm-interview.dto";
import { isInterviewComplete } from "./interview-eligibility.util";
import { buildInterviewIcs } from "./ics.util";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { runInBackground } from "@/common/utils/background-task.util";
import {
  BadRequestApiException,
  ConflictApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { CompanyMembershipService } from "@/modules/company/company-membership.service";

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    private readonly interviewsRepository: InterviewsRepository,
    private readonly notificationsService: NotificationsService,
    private readonly companyMembershipService: CompanyMembershipService,
  ) {}

  // Single source of truth for "has this application's interview actually
  // happened" — Interview is this module's aggregate, so modules that gate
  // something on a completed interview (ReviewsService, ScorecardsService)
  // call this instead of each querying the interviews table and re-deriving
  // the rule themselves. ReviewsService is the one exception: it already has
  // the interview bundled into a single application-select for efficiency
  // (see reviewApplicationSelect), so it applies isInterviewComplete
  // directly to that instead of making a second round trip through here.
  async isComplete(applicationId: string): Promise<boolean> {
    const interview =
      await this.interviewsRepository.findEligibilityByApplicationId(
        applicationId,
      );
    return isInterviewComplete(interview);
  }

  // Backs GET /employer/interviews/upcoming. INTERVIEWER's whole access
  // model elsewhere is "assigned only" (see Interview.interviewerId's
  // schema comment and ApplicationAccessGuard's assignment bypass) — the
  // agenda follows the same rule instead of exposing the full company
  // schedule to a role that can't otherwise see every application. `scope`
  // is decided here, alongside the filter it drives, and returned rather
  // than left for EmployerService to re-derive from the raw role a second
  // time (see UpcomingInterviewsScope's comment).
  async listUpcomingForCompany(
    employerId: string,
    viewerRole: CompanyMemberRole,
    viewerUserId: string,
  ): Promise<UpcomingInterviewsResult> {
    const mineOnly = viewerRole === "INTERVIEWER";
    const rows = await this.interviewsRepository.findUpcomingForCompany(
      employerId,
      mineOnly ? viewerUserId : undefined,
    );

    return {
      scope: mineOnly ? "mine" : "team",
      interviews: rows.map((row) => ({
        id: row.id,
        applicationId: row.applicationId,
        // Never actually null here — the repository's own where-clause only
        // ever matches rows with confirmedSlot >= now — but the column
        // itself is nullable, so Prisma's generated type doesn't know that.
        confirmedSlot: row.confirmedSlot!,
        durationMinutes: row.durationMinutes,
        meetingUrl: row.meetingUrl,
        talentName: row.application.talent.user.name,
        jobTitle: row.application.job.title,
        interviewerId: row.interviewerId,
        interviewerName: row.interviewer?.name ?? null,
      })),
    };
  }

  // Bundles the interview + header context in one response, same shape as
  // MessagesService.list — parties is already loaded by the caller's
  // ownership guard, so this adds zero extra queries.
  async get(parties: ApplicationParties): Promise<InterviewWithHeader> {
    const interview = await this.interviewsRepository.findByApplicationId(
      parties.id,
    );
    return {
      interview,
      jobTitle: parties.job.title,
      employerName: parties.job.employer.companyName,
      talentName: parties.talent.user.name,
    };
  }

  // Backs GET .../interview/ics on both the talent and employer sides
  // (same underlying data as get() above, reused rather than re-queried).
  // Only ever callable once the interview is actually CONFIRMED — there's
  // nothing meaningful to put on a calendar before a slot exists.
  async getIcsFile(parties: ApplicationParties): Promise<string> {
    const header = await this.get(parties);
    if (!header.interview) {
      throw new NotFoundApiException(
        "No interview exists for this application",
        ErrorCode.INTERVIEW_NOT_FOUND,
      );
    }
    if (
      header.interview.status !== "CONFIRMED" ||
      !header.interview.confirmedSlot
    ) {
      throw new BadRequestApiException(
        "This interview doesn't have a confirmed time yet",
        ErrorCode.INTERVIEW_NOT_CONFIRMED,
      );
    }
    return buildInterviewIcs({
      interviewId: header.interview.id,
      jobTitle: header.jobTitle,
      employerName: header.employerName,
      talentName: header.talentName,
      confirmedSlot: header.interview.confirmedSlot,
      durationMinutes: header.interview.durationMinutes,
      meetingUrl: header.interview.meetingUrl,
    });
  }

  async propose(parties: ApplicationParties, dto: ProposeInterviewDto) {
    if (parties.status !== "INTERVIEW") {
      throw new BadRequestApiException(
        "The application must be at the INTERVIEW stage before scheduling",
        ErrorCode.APPLICATION_NOT_AT_INTERVIEW_STAGE,
      );
    }

    const existing = await this.interviewsRepository.findByApplicationId(
      parties.id,
    );
    if (existing?.status === "CONFIRMED") {
      throw new ConflictApiException(
        "This interview is already confirmed and can no longer be revised",
        ErrorCode.INTERVIEW_ALREADY_CONFIRMED,
      );
    }

    const now = Date.now();
    const proposedSlots = dto.proposedSlots.map((slot) => new Date(slot));
    if (proposedSlots.some((slot) => slot.getTime() <= now)) {
      throw new BadRequestApiException(
        "Proposed interview times must be in the future",
        ErrorCode.INVALID_INTERVIEW_SLOT,
      );
    }

    // Never trust that interviewerId is even a real company member, let
    // alone the right company's — an id from another company (or a random
    // string) must fail here, not silently grant that user assigned-only
    // access via ApplicationAccessGuard once they somehow are a member.
    if (dto.interviewerId) {
      const assignee = await this.companyMembershipService.resolveMembership(
        dto.interviewerId,
      );
      if (!assignee || assignee.employerId !== parties.job.employerId) {
        throw new BadRequestApiException(
          "interviewerId must be a member of your company",
          ErrorCode.COMPANY_MEMBER_NOT_FOUND,
        );
      }
    }

    const interview = await this.interviewsRepository.upsertPending({
      applicationId: parties.id,
      durationMinutes: dto.durationMinutes,
      proposedSlots,
      meetingUrl: dto.meetingUrl,
      interviewerId: dto.interviewerId,
    });

    runInBackground(
      this.notificationsService.create({
        userId: parties.talent.userId,
        type: "INTERVIEW_PROPOSED",
        title: `${parties.job.employer.companyName} proposed interview times`,
        body: `${proposedSlots.length} option(s) for a ${dto.durationMinutes}-min interview for ${parties.job.title}.`,
        link: `/applications/${parties.id}/interview`,
      }),
      this.logger,
      `Failed to create interview-proposed notification for application ${parties.id}`,
    );

    return interview;
  }

  async confirm(parties: ApplicationParties, dto: ConfirmInterviewDto) {
    const interview = await this.interviewsRepository.findByApplicationId(
      parties.id,
    );
    if (!interview) {
      throw new NotFoundApiException(
        "No interview has been proposed for this application yet",
        ErrorCode.INTERVIEW_NOT_FOUND,
      );
    }

    const slot = new Date(dto.slot);
    const isProposedSlot = interview.proposedSlots.some(
      (proposed) => proposed.getTime() === slot.getTime(),
    );
    if (!isProposedSlot) {
      throw new BadRequestApiException(
        "That time wasn't one of the proposed options",
        ErrorCode.INVALID_INTERVIEW_SLOT,
      );
    }

    const updated = await this.interviewsRepository.confirmSlot(
      parties.id,
      slot,
    );
    if (!updated) {
      throw new ConflictApiException(
        "This interview is already confirmed",
        ErrorCode.INTERVIEW_ALREADY_CONFIRMED,
      );
    }

    runInBackground(
      this.notificationsService.create({
        userId: parties.job.employer.userId,
        type: "INTERVIEW_CONFIRMED",
        title: "Interview confirmed",
        body: `${parties.talent.user.name ?? "The candidate"} confirmed the interview for ${parties.job.title}.`,
        link: `/applications/${parties.id}/interview`,
      }),
      this.logger,
      `Failed to create interview-confirmed notification for application ${parties.id}`,
    );

    return updated;
  }

  // Employer-only (see EmployerController's ApplicationOwnershipGuard on the
  // route that calls this) — cancels a PENDING or CONFIRMED interview.
  // Terminal at the data layer, but the employer can always schedule a fresh
  // one afterward: propose()'s upsertPending resets a CANCELLED row back to
  // PENDING rather than treating the applicationId as permanently spent.
  async cancel(parties: ApplicationParties): Promise<InterviewRecord> {
    const cancelled = await this.interviewsRepository.cancel(parties.id);
    if (!cancelled) {
      throw new NotFoundApiException(
        "No interview to cancel, or it's already cancelled",
        ErrorCode.INTERVIEW_NOT_FOUND,
      );
    }

    runInBackground(
      this.notificationsService.create({
        userId: parties.talent.userId,
        type: "INTERVIEW_CANCELLED",
        title: "Interview cancelled",
        body: `${parties.job.employer.companyName} cancelled the interview for ${parties.job.title}.`,
        link: `/applications/${parties.id}/interview`,
      }),
      this.logger,
      `Failed to create interview-cancelled notification for application ${parties.id}`,
    );

    return cancelled;
  }
}
