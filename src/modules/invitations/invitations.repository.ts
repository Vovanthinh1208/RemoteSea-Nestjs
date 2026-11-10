import { Injectable } from "@nestjs/common";
import {
  BadRequestApiException,
  ConflictApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { EmployerProfile, JobInvitation } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  ownApplicationSelect,
  type OwnApplication,
} from "@/modules/applications/interfaces";
import {
  jobWithEmployerEmailInclude,
  type JobWithEmployerEmail,
} from "@/common/types/job-with-employer-email.type";
import {
  invitationForTalentSelect,
  invitationOwnerSelect,
  type CreateInvitationInput,
  type InvitationForTalent,
  type InvitationOwner,
} from "./interfaces";

@Injectable()
export class InvitationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findEmployerProfileByUserId(
    userId: string,
  ): Promise<Pick<
    EmployerProfile,
    "id" | "companyName" | "isVerified"
  > | null> {
    return this.prisma.employerProfile.findFirst({
      where: {
        members: { some: { userId, role: { in: ["OWNER", "RECRUITER"] } } },
        suspendedAt: null,
      },
      select: { id: true, companyName: true, isVerified: true },
    });
  }

  /** Ownership + email-content check for InvitationsService.send — job must
   * belong to the caller's employer profile and be ACTIVE (no inviting
   * candidates to a draft/closed listing). */
  findJobForInvite(jobId: string) {
    return this.prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        employerId: true,
      },
    });
  }

  findTalentIdByUserId(userId: string): Promise<{ id: string } | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  findTalentWithUser(talentId: string) {
    return this.prisma.talentProfile.findUnique({
      where: { id: talentId },
      select: {
        id: true,
        userId: true,
        isOpenToWork: true,
        visibility: true,
        user: {
          select: { email: true, name: true, isPaused: true, bannedAt: true },
        },
      },
    });
  }

  findByJobAndTalent(
    jobId: string,
    talentId: string,
  ): Promise<Pick<JobInvitation, "id"> | null> {
    return this.prisma.jobInvitation.findFirst({
      where: { jobId, talentId, status: "PENDING" },
      select: { id: true },
    });
  }

  create(input: CreateInvitationInput): Promise<JobInvitation> {
    return this.prisma.jobInvitation.create({
      data: {
        jobId: input.jobId,
        talentId: input.talentId,
        employerId: input.employerId,
        message: input.message,
      },
    });
  }

  /** Self-contained narrow query (not a cross-import of UsersRepository) —
   * same reasoning as TalentRepository.isVerifiedEmployer. */
  async employerMessagesEnabled(userId: string): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: { employerMessages: true },
    });
    // No row yet (never opened Settings > Notifications) — the schema
    // default for employerMessages is true, so an absent row means "on".
    return pref?.employerMessages ?? true;
  }

  findAllForTalent(talentId: string): Promise<InvitationForTalent[]> {
    return this.prisma.jobInvitation.findMany({
      where: { talentId },
      orderBy: { createdAt: "desc" },
      select: invitationForTalentSelect,
    });
  }

  findOwnerById(id: string): Promise<InvitationOwner | null> {
    return this.prisma.jobInvitation.findUnique({
      where: { id },
      select: invitationOwnerSelect,
    });
  }

  async decline(id: string): Promise<JobInvitation> {
    const result = await this.prisma.jobInvitation.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    if (!result.count)
      throw new ConflictApiException(
        "Already responded",
        ErrorCode.INVITATION_ALREADY_RESPONDED,
      );
    return this.prisma.jobInvitation.findUniqueOrThrow({ where: { id } });
  }

  /** Accepting turns the invitation into a real Application — same create +
   * applyCount increment ApplicationsRepository.createAndIncrementApplyCount
   * does (including its initial PENDING ApplicationStatusEvent — Application
   * Transparency's timeline treats an accepted invite exactly like a
   * self-initiated apply), plus marking the invitation ACCEPTED, all in one
   * transaction. */
  async accept(
    invitation: InvitationOwner,
  ): Promise<{ application: OwnApplication; job: JobWithEmployerEmail }> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.jobInvitation.updateMany({
        where: { id: invitation.id, status: "PENDING" },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
      if (!claimed.count)
        throw new ConflictApiException(
          "Already responded",
          ErrorCode.INVITATION_ALREADY_RESPONDED,
        );
      const live = await tx.job.findFirst({
        where: {
          id: invitation.jobId,
          status: "ACTIVE",
          employer: { suspendedAt: null },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!live)
        throw new BadRequestApiException(
          "Job is no longer active",
          ErrorCode.JOB_NOT_ACTIVE,
        );
      const existing = await tx.application.findUnique({
        where: {
          jobId_talentId: {
            jobId: invitation.jobId,
            talentId: invitation.talentId,
          },
        },
        select: { id: true },
      });
      const created =
        existing ??
        (await tx.application.create({
          data: { jobId: invitation.jobId, talentId: invitation.talentId },
          select: { id: true },
        }));
      if (!existing)
        await tx.applicationStatusEvent.create({
          data: { applicationId: created.id, status: "APPLIED" },
        });
      const [application, job] = await Promise.all([
        tx.application.findUniqueOrThrow({
          where: { id: created.id },
          select: ownApplicationSelect,
        }),
        tx.job.update({
          where: { id: invitation.jobId },
          data: { applyCount: { increment: existing ? 0 : 1 } },
          include: jobWithEmployerEmailInclude,
        }),
      ]);
      return { application, job };
    });
  }
}
