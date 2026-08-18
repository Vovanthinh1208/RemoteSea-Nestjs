import { Injectable, Logger } from "@nestjs/common";
import { Prisma, type JobInvitation } from "@prisma/client";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { assertFound } from "@/common/utils/assert-found";
import { runInBackground } from "@/common/utils/background-task.util";
import { EmailService } from "@/common/services/email.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { InvitationsRepository } from "./invitations.repository";
import type { SendInvitationDto } from "./dto/send-invitation.dto";
import type { RespondInvitationDto } from "./dto/respond-invitation.dto";
import type { InvitationForTalent } from "./interfaces";

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly invitationsRepository: InvitationsRepository,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async send(
    user: AuthenticatedUser,
    dto: SendInvitationDto,
  ): Promise<JobInvitation> {
    const employer =
      await this.invitationsRepository.findEmployerProfileByUserId(user.id);
    if (!employer) {
      throw new ForbiddenApiException(
        "Employer profile required",
        ErrorCode.EMPLOYER_PROFILE_REQUIRED,
      );
    }

    const job = await this.invitationsRepository.findJobForInvite(dto.jobId);
    assertFound(job, "Job not found", ErrorCode.JOB_NOT_FOUND);
    if (job.employerId !== employer.id) {
      throw new ForbiddenApiException(
        "You don't own this job",
        ErrorCode.JOB_ACCESS_DENIED,
      );
    }
    if (job.status !== "ACTIVE") {
      throw new BadRequestApiException(
        "Job must be active to invite candidates",
        ErrorCode.JOB_NOT_ACTIVE,
      );
    }

    const talent = await this.invitationsRepository.findTalentWithUser(
      dto.talentId,
    );
    assertFound(talent, "Talent not found", ErrorCode.TALENT_PROFILE_NOT_FOUND);

    const existing = await this.invitationsRepository.findByJobAndTalent(
      dto.jobId,
      dto.talentId,
    );
    if (existing) {
      throw new ConflictApiException(
        "Already invited",
        ErrorCode.ALREADY_INVITED,
      );
    }

    let invitation: JobInvitation;
    try {
      invitation = await this.invitationsRepository.create({
        jobId: dto.jobId,
        talentId: dto.talentId,
        employerId: employer.id,
        message: dto.message,
      });
    } catch (error) {
      // Same race-fallback reasoning as ApplicationsService.apply — the
      // findByJobAndTalent check above is only a fast path.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictApiException(
          "Already invited",
          ErrorCode.ALREADY_INVITED,
        );
      }
      throw error;
    }

    const emailEnabled =
      await this.invitationsRepository.employerMessagesEnabled(talent.userId);
    if (emailEnabled) {
      runInBackground(
        this.emailService.sendJobInvitationEmail(
          talent.user.email,
          talent.user.name ?? "there",
          job.title,
          employer.companyName,
        ),
        this.logger,
        `Failed to send invitation email for invitation ${invitation.id}`,
      );
    }

    // In-app notification is a separate, always-on channel — unlike the
    // email above, it's never gated by NotificationPreference.employerMessages.
    runInBackground(
      this.notificationsService.create({
        userId: talent.userId,
        type: "INVITATION_RECEIVED",
        title: `${employer.companyName} invited you to apply`,
        body: `You've been invited to apply for ${job.title}.`,
        link: `/jobs/${job.slug}`,
      }),
      this.logger,
      `Failed to create invitation notification for invitation ${invitation.id}`,
    );

    return invitation;
  }

  async listForTalent(userId: string): Promise<InvitationForTalent[]> {
    const talent =
      await this.invitationsRepository.findTalentIdByUserId(userId);
    if (!talent) return [];
    return this.invitationsRepository.findAllForTalent(talent.id);
  }

  async respond(
    userId: string,
    invitationId: string,
    dto: RespondInvitationDto,
  ): Promise<{ status: "ACCEPTED" | "DECLINED" }> {
    const invitation =
      await this.invitationsRepository.findOwnerById(invitationId);
    assertFound(
      invitation,
      "Invitation not found",
      ErrorCode.INVITATION_NOT_FOUND,
    );
    if (invitation.talent.userId !== userId) {
      throw new ForbiddenApiException(
        "Not your invitation",
        ErrorCode.INVITATION_ACCESS_DENIED,
      );
    }
    if (invitation.status !== "PENDING") {
      throw new ConflictApiException(
        "Already responded",
        ErrorCode.INVITATION_ALREADY_RESPONDED,
      );
    }

    if (dto.action === "DECLINE") {
      await this.invitationsRepository.decline(invitation.id);
      return { status: "DECLINED" };
    }

    const { application, job } =
      await this.invitationsRepository.accept(invitation);

    // The invitation is already accepted and the application already
    // committed above — same "don't let a notification-email failure turn a
    // successful accept into a 500" reasoning as ApplicationsService.apply.
    runInBackground(
      this.emailService.sendApplicationReceivedEmail(
        job.employer.user.email,
        job.title,
        invitation.talent.user.name ?? "A candidate",
      ),
      this.logger,
      `Failed to send application-received email for application ${application.id}`,
    );

    return { status: "ACCEPTED" };
  }
}
