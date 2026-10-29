import { Injectable, Logger } from "@nestjs/common";
import type { CompanyMemberRole } from "@prisma/client";
import { InterviewsRepository } from "./interviews.repository";
import type {
  ApplicationParties,
  InterviewContacts,
  InterviewRecord,
  InterviewWithHeader,
  UpcomingInterviewsResult,
} from "./interfaces";
import type { ProposeInterviewDto } from "./dto/propose-interview.dto";
import type { ConfirmInterviewDto } from "./dto/confirm-interview.dto";
import type { CancelInterviewDto } from "./dto/cancel-interview.dto";
import { isInterviewComplete } from "./interview-eligibility.util";
import { buildInterviewIcs, type IcsParticipant } from "./ics.util";
import { INTERVIEW_PLATFORM_LABELS, INTERVIEW_PLATFORMS } from "./constants";
import {
  EmailService,
  type InterviewEmailDetails,
} from "@/common/services/email.service";
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
    private readonly emailService: EmailService,
  ) {}

  private emailDetails(
    parties: ApplicationParties,
    interview: Pick<
      InterviewRecord,
      "title" | "platform" | "durationMinutes" | "meetingUrl"
    >,
  ): InterviewEmailDetails {
    const platform = INTERVIEW_PLATFORMS.find((p) => p === interview.platform);
    return {
      title: interview.title ?? `Interview for ${parties.job.title}`,
      jobTitle: parties.job.title,
      companyName: parties.job.employer.companyName,
      durationMinutes: interview.durationMinutes,
      platform: platform ? INTERVIEW_PLATFORM_LABELS[platform] : null,
      meetingUrl: interview.meetingUrl,
    };
  }

  // PB63 AC3: the company contact organizes, the talent and (if assigned and
  // different from the company contact) the interviewer attend.
  private icsParticipants(contacts: InterviewContacts): {
    organizer: IcsParticipant;
    attendees: IcsParticipant[];
  } {
    const attendees: IcsParticipant[] = [contacts.talent];
    if (
      contacts.interviewer &&
      contacts.interviewer.email !== contacts.employer.email
    ) {
      attendees.push(contacts.interviewer);
    }
    return { organizer: contacts.employer, attendees };
  }

  private buildIcs(
    parties: ApplicationParties,
    interview: InterviewRecord & { confirmedSlot: Date },
    contacts: InterviewContacts | null,
  ): string {
    return buildInterviewIcs({
      interviewId: interview.id,
      title: interview.title,
      jobTitle: parties.job.title,
      employerName: parties.job.employer.companyName,
      talentName: parties.talent.user.name,
      confirmedSlot: interview.confirmedSlot,
      durationMinutes: interview.durationMinutes,
      meetingUrl: interview.meetingUrl,
      ...(contacts ? this.icsParticipants(contacts) : {}),
    });
  }

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
        title: row.title,
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
    const contacts = await this.interviewsRepository.findContacts(parties.id);
    return this.buildIcs(
      parties,
      { ...header.interview, confirmedSlot: header.interview.confirmedSlot },
      contacts,
    );
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
      title: dto.title,
      platform: dto.platform,
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
        body: `${dto.title}: ${proposedSlots.length} option(s) for a ${dto.durationMinutes}-min interview for ${parties.job.title}.`,
        link: `/applications/${parties.id}/interview`,
      }),
      this.logger,
      `Failed to create interview-proposed notification for application ${parties.id}`,
    );

    // PB60 AC5: e-mail as well as in-app, gated by the talent's
    // applicationUpdates preference like other application e-mails.
    runInBackground(
      (async () => {
        const contacts = await this.interviewsRepository.findContacts(
          parties.id,
        );
        if (!contacts?.talent.emailEnabled) return;
        await this.emailService.sendInterviewProposedEmail(
          contacts.talent.email,
          contacts.talent.name ?? "there",
          this.emailDetails(parties, interview),
          proposedSlots,
          parties.id,
        );
      })(),
      this.logger,
      `Failed to send interview-proposed email for application ${parties.id}`,
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
    if (!Number.isFinite(slot.getTime()) || slot.getTime() <= Date.now()) {
      throw new BadRequestApiException(
        "The selected interview time must still be in the future",
        ErrorCode.INVALID_INTERVIEW_SLOT,
      );
    }
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

    // PB61 AC4: confirmation e-mail with calendar.ics to both sides — the
    // talent who just confirmed it is still sent their copy of the file.
    runInBackground(
      (async () => {
        const contacts = await this.interviewsRepository.findContacts(
          parties.id,
        );
        if (!contacts) return;
        const ics = this.buildIcs(
          parties,
          { ...updated, confirmedSlot: slot },
          contacts,
        );
        const details = this.emailDetails(parties, updated);
        const recipients = [
          contacts.talent,
          contacts.employer,
          ...this.icsParticipants(contacts).attendees.slice(1),
        ];
        await Promise.all(
          recipients.map((recipient) =>
            this.emailService.sendInterviewConfirmedEmail(
              recipient.email,
              recipient.name ?? "there",
              details,
              slot,
              ics,
            ),
          ),
        );
      })(),
      this.logger,
      `Failed to send interview-confirmed emails for application ${parties.id}`,
    );

    return updated;
  }

  // Employer-only (see EmployerController's ApplicationOwnershipGuard on the
  // route that calls this) — cancels a PENDING or CONFIRMED interview.
  // Terminal at the data layer, but the employer can always schedule a fresh
  // one afterward: propose()'s upsertPending resets a CANCELLED row back to
  // PENDING rather than treating the applicationId as permanently spent.
  async cancel(
    parties: ApplicationParties,
    dto: CancelInterviewDto,
  ): Promise<InterviewRecord> {
    const cancelled = await this.interviewsRepository.cancel(
      parties.id,
      dto.reason,
    );
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
        body: `${parties.job.employer.companyName} cancelled the interview for ${parties.job.title}. Reason: ${dto.reason}`,
        link: `/applications/${parties.id}/interview`,
      }),
      this.logger,
      `Failed to create interview-cancelled notification for application ${parties.id}`,
    );

    // PB62 AC4 / BR1: the reason always reaches the talent by e-mail — a
    // cancellation is not something to silence with a preference.
    runInBackground(
      (async () => {
        const contacts = await this.interviewsRepository.findContacts(
          parties.id,
        );
        if (!contacts) return;
        await this.emailService.sendInterviewCancelledEmail(
          contacts.talent.email,
          contacts.talent.name ?? "there",
          this.emailDetails(parties, cancelled),
          dto.reason,
        );
      })(),
      this.logger,
      `Failed to send interview-cancelled email for application ${parties.id}`,
    );

    return cancelled;
  }
}
