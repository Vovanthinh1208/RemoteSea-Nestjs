import { Injectable, Logger } from "@nestjs/common";
import { InterviewsRepository } from "./interviews.repository";
import type { ApplicationParties, InterviewWithHeader } from "./interfaces";
import type { ProposeInterviewDto } from "./dto/propose-interview.dto";
import type { ConfirmInterviewDto } from "./dto/confirm-interview.dto";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { runInBackground } from "@/common/utils/background-task.util";
import {
  BadRequestApiException,
  ConflictApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    private readonly interviewsRepository: InterviewsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

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

    const interview = await this.interviewsRepository.upsertPending({
      applicationId: parties.id,
      durationMinutes: dto.durationMinutes,
      proposedSlots,
      meetingUrl: dto.meetingUrl,
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
}
