import { Injectable } from "@nestjs/common";
import type { Prisma, TalentProfile, User } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { TalentProfileDto } from "./dto/update-talent-profile.dto";
import {
  ownProfileArgs,
  publicProfileArgs,
  talentProfileWithSkillsArgs,
  type OwnTalentProfile,
  type PublicTalentProfile,
  type TalentProfileWithSkills,
} from "./interfaces";
import {
  talentSearchItemSelect,
  type TalentSearchItem,
} from "@/common/types/talent-search-item.type";
import {
  interviewActivitySelect,
  invitationActivitySelect,
  messageActivitySelect,
  statusEventActivitySelect,
  type InterviewActivitySource,
  type InvitationActivitySource,
  type MessageActivitySource,
  type StatusEventActivitySource,
} from "./activity.interfaces";

type ProfileScalarData = Omit<TalentProfileDto, "skills">;

@Injectable()
export class TalentRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<OwnTalentProfile | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      ...ownProfileArgs,
    });
  }

  findBySlug(slug: string): Promise<PublicTalentProfile | null> {
    return this.prisma.talentProfile.findUnique({
      where: { slug },
      ...publicProfileArgs,
    });
  }

  findUserName(userId: string): Promise<Pick<User, "name"> | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
  }

  // Backs the VERIFIED_EMPLOYERS visibility gate in TalentService.getPublicProfile.
  async isVerifiedEmployer(userId: string): Promise<boolean> {
    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId },
      select: { isVerified: true },
    });
    return employer?.isVerified ?? false;
  }

  findProfileForVerification(userId: string): Promise<{ id: string } | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  // Deletes any prior unconsumed row for this talent first (resubmitting
  // with a new/different address invalidates the old link, not a second
  // live token), then creates the fresh one and marks the profile PENDING —
  // one transaction so a submit can't half-apply. Mirrors
  // EmployerRepository.createEmailVerification exactly, minus the
  // domain-match precondition (nothing to validate it against here).
  async createEmailVerification(
    talentId: string,
    email: string,
    token: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.talentEmailVerification.deleteMany({
        where: { talentId, consumedAt: null },
      }),
      this.prisma.talentEmailVerification.create({
        data: { talentId, email, token, expiresAt },
      }),
      this.prisma.talentProfile.update({
        where: { id: talentId },
        data: { verificationEmail: email, verificationStatus: "PENDING" },
      }),
    ]);
  }

  findEmailVerificationByToken(token: string) {
    return this.prisma.talentEmailVerification.findUnique({
      where: { token },
    });
  }

  markVerificationFailed(talentId: string): Promise<TalentProfile> {
    return this.prisma.talentProfile.update({
      where: { id: talentId },
      data: { verificationStatus: "FAILED" },
    });
  }

  // Conditional updateMany (consumedAt: null), not a plain update — same
  // single-use-under-a-race guarantee as
  // EmployerRepository.consumeEmailVerification. Returns false if the row
  // was already consumed (or never existed) by the time this runs.
  async consumeEmailVerification(
    verificationId: string,
    talentId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.talentEmailVerification.updateMany({
        where: { id: verificationId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (count === 0) return false;

      await tx.talentProfile.update({
        where: { id: talentId },
        data: {
          isVerified: true,
          verifiedAt: new Date(),
          verificationStatus: "VERIFIED",
        },
      });
      return true;
    });
  }

  // upsertProfile only needs these 3 scalars (to validate the *effective*
  // post-patch salary range and resume-URL ownership) — not the full
  // skills+skill+user join ownProfileArgs pulls in for the "get my profile"
  // read endpoint.
  findSalaryAndResumeByUserId(
    userId: string,
  ): Promise<Pick<
    TalentProfile,
    "desiredSalaryMin" | "desiredSalaryMax" | "resumeUrl"
  > | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      select: {
        desiredSalaryMin: true,
        desiredSalaryMax: true,
        resumeUrl: true,
      },
    });
  }

  // Upsert + skill replacement run in one transaction — previously two separate
  // round-trips, so a failure between them could leave the profile updated but
  // its skills stale (deleted-and-not-recreated, or simply never replaced).
  upsertProfileWithSkills(
    userId: string,
    slug: string,
    data: ProfileScalarData,
    skills: { skillId: string; yearsExp?: number }[] | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.talentProfile.upsert({
        where: { userId },
        create: { userId, slug, ...data },
        update: data,
      });

      if (skills) {
        await tx.talentSkill.deleteMany({ where: { talentId: profile.id } });
        await tx.talentSkill.createMany({
          data: skills.map((s) => ({
            talentId: profile.id,
            skillId: s.skillId,
            yearsExp: s.yearsExp,
          })),
        });
      }

      return profile;
    });
  }

  findByIdWithSkills(id: string): Promise<TalentProfileWithSkills | null> {
    return this.prisma.talentProfile.findUnique({
      where: { id },
      ...talentProfileWithSkillsArgs,
    });
  }

  search(
    where: Prisma.TalentProfileWhereInput,
    skip: number,
    take: number,
  ): Promise<TalentSearchItem[]> {
    return this.prisma.talentProfile.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: "desc" },
      select: talentSearchItemSelect,
    });
  }

  count(where: Prisma.TalentProfileWhereInput): Promise<number> {
    return this.prisma.talentProfile.count({ where });
  }

  // Twin of ApplicationsRepository.findTalentIdByUserId — the activity feed
  // only needs the id to scope its four source queries below, not the full
  // ownProfileArgs join.
  findTalentIdByUserId(
    userId: string,
  ): Promise<Pick<TalentProfile, "id"> | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  // PENDING is excluded here (not in activity.util's mapper) so the fetch
  // itself never spends the ACTIVITY_FEED_LIMIT budget on rows that get
  // dropped downstream — every application's very first event.
  findRecentStatusEvents(
    talentId: string,
    limit: number,
  ): Promise<StatusEventActivitySource[]> {
    return this.prisma.applicationStatusEvent.findMany({
      where: { status: { not: "PENDING" }, application: { talentId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: statusEventActivitySelect,
    });
  }

  // senderId != userId (not talentId) — Message.sender is a User, and this
  // feed only reports messages the *employer* sent, not the talent's own.
  findRecentMessagesReceived(
    talentId: string,
    userId: string,
    limit: number,
  ): Promise<MessageActivitySource[]> {
    return this.prisma.message.findMany({
      where: { senderId: { not: userId }, application: { talentId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: messageActivitySelect,
    });
  }

  findRecentInterviews(
    talentId: string,
    limit: number,
  ): Promise<InterviewActivitySource[]> {
    return this.prisma.interview.findMany({
      where: { application: { talentId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: interviewActivitySelect,
    });
  }

  findRecentInvitations(
    talentId: string,
    limit: number,
  ): Promise<InvitationActivitySource[]> {
    return this.prisma.jobInvitation.findMany({
      where: { talentId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: invitationActivitySelect,
    });
  }
}
