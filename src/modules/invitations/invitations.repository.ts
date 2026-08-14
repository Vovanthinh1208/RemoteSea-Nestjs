import { Injectable } from "@nestjs/common";
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
  ): Promise<Pick<EmployerProfile, "id" | "companyName"> | null> {
    return this.prisma.employerProfile.findUnique({
      where: { userId },
      select: { id: true, companyName: true },
    });
  }

  /** Ownership + email-content check for InvitationsService.send — job must
   * belong to the caller's employer profile and be ACTIVE (no inviting
   * candidates to a draft/closed listing). */
  findJobForInvite(jobId: string) {
    return this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true, status: true, employerId: true },
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
        user: { select: { email: true, name: true } },
      },
    });
  }

  findByJobAndTalent(
    jobId: string,
    talentId: string,
  ): Promise<Pick<JobInvitation, "id"> | null> {
    return this.prisma.jobInvitation.findUnique({
      where: { jobId_talentId: { jobId, talentId } },
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

  decline(id: string): Promise<JobInvitation> {
    return this.prisma.jobInvitation.update({
      where: { id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
  }

  /** Accepting turns the invitation into a real Application — same create +
   * applyCount increment ApplicationsRepository.createAndIncrementApplyCount
   * does, plus marking the invitation ACCEPTED, all in one transaction. */
  async accept(
    invitation: InvitationOwner,
  ): Promise<{ application: OwnApplication; job: JobWithEmployerEmail }> {
    const [, application, job] = await this.prisma.$transaction([
      this.prisma.jobInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      }),
      this.prisma.application.create({
        data: { jobId: invitation.jobId, talentId: invitation.talentId },
        select: ownApplicationSelect,
      }),
      this.prisma.job.update({
        where: { id: invitation.jobId },
        data: { applyCount: { increment: 1 } },
        include: jobWithEmployerEmailInclude,
      }),
    ]);
    return { application, job };
  }
}
