import { Injectable } from "@nestjs/common";
import type { Account, NotificationPreference, User } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { UpdateAccountDto } from "./dto/update-account.dto";
import type { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";

const ACCOUNT_FIELDS_SELECT = {
  id: true,
  phone: true,
  language: true,
  region: true,
  currencyDisplay: true,
  image: true,
} as const;

export type AccountFields = Pick<
  User,
  "id" | "phone" | "language" | "region" | "currencyDisplay" | "image"
>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  updateName(
    id: string,
    name: string,
  ): Promise<Pick<User, "id" | "name" | "email">> {
    return this.prisma.user.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, email: true },
    });
  }

  findAccount(id: string): Promise<AccountFields | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: ACCOUNT_FIELDS_SELECT,
    });
  }

  updateAccount(id: string, data: UpdateAccountDto): Promise<AccountFields> {
    return this.prisma.user.update({
      where: { id },
      data,
      select: ACCOUNT_FIELDS_SELECT,
    });
  }

  // Row is created lazily on first read/write rather than at signup — most
  // users will never touch these, and every field already has a schema
  // default, so an absent row and a freshly-created default row are
  // equivalent from the caller's point of view.
  async getNotificationPreferences(
    userId: string,
  ): Promise<NotificationPreference> {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    return this.prisma.notificationPreference.create({ data: { userId } });
  }

  updateNotificationPreferences(
    userId: string,
    data: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreference> {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  setPaused(
    id: string,
    isPaused: boolean,
  ): Promise<Pick<User, "id" | "isPaused" | "pausedAt">> {
    return this.prisma.user.update({
      where: { id },
      data: { isPaused, pausedAt: isPaused ? new Date() : null },
      select: { id: true, isPaused: true, pausedAt: true },
    });
  }

  findPauseState(id: string): Promise<Pick<User, "isPaused"> | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { isPaused: true },
    });
  }

  // Everything a user is entitled to take with them — profile + applications
  // (talent side) or company profile + postings (employer side). Excludes
  // internal-only fields (passwordHash, stripeSessionId, reviewNote) that
  // aren't "the user's data" in the export sense.
  findExportData(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        talent: {
          include: {
            skills: { include: { skill: { select: { name: true } } } },
            applications: {
              include: { job: { select: { title: true, slug: true } } },
            },
          },
        },
        employer: {
          include: {
            jobs: {
              select: {
                title: true,
                slug: true,
                status: true,
                createdAt: true,
                publishedAt: true,
              },
            },
          },
        },
        jobAlerts: true,
      },
    });
  }

  listConnections(
    userId: string,
  ): Promise<Pick<Account, "provider" | "providerAccountId">[]> {
    return this.prisma.account.findMany({
      where: { userId },
      select: { provider: true, providerAccountId: true },
    });
  }

  countConnections(userId: string): Promise<number> {
    return this.prisma.account.count({ where: { userId } });
  }

  findPasswordHashAndConnectionCount(
    userId: string,
  ): Promise<{ passwordHash: string | null; connectionCount: number } | null> {
    return this.prisma.user
      .findUnique({
        where: { id: userId },
        select: { passwordHash: true, _count: { select: { accounts: true } } },
      })
      .then((u) =>
        u
          ? { passwordHash: u.passwordHash, connectionCount: u._count.accounts }
          : null,
      );
  }

  async deleteConnection(userId: string, provider: string): Promise<boolean> {
    const { count } = await this.prisma.account.deleteMany({
      where: { userId, provider },
    });
    return count > 0;
  }

  deleteUser(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }

  // Read before deleteUser so the caller can best-effort clean up the S3
  // object these reference — TalentProfile/EmployerProfile cascade-delete
  // with the User row (see the schema's onDelete: Cascade), so once that
  // completes there's no longer any DB record of the resume/logo's key to
  // find it by. Without this read, the file would sit orphaned in the
  // bucket forever (same "nothing else ever cleans this up" gap that
  // uploads.service.ts's deleteObjectByUrl already closes for profile
  // *updates* — this closes it for account deletion instead).
  async findProfileFileUrls(
    userId: string,
  ): Promise<{ resumeUrl: string | null; logoUrl: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        talent: { select: { resumeUrl: true } },
        employer: { select: { logoUrl: true } },
      },
    });
    return {
      resumeUrl: user?.talent?.resumeUrl ?? null,
      logoUrl: user?.employer?.logoUrl ?? null,
    };
  }

  // Backs UsersService.deleteAccount's upfront check — jobs.employerId's FK
  // is ON DELETE RESTRICT specifically so a User delete can't cascade through
  // EmployerProfile and silently wipe other users' Application/SavedJob rows
  // (see the migration that changed it). This lets deleteAccount give a
  // clear error before attempting the delete, rather than surfacing the raw
  // FK-violation the database would otherwise reject it with.
  countEmployerJobs(userId: string): Promise<number> {
    return this.prisma.job.count({ where: { employer: { userId } } });
  }

  // Same reasoning as countEmployerJobs above, for the same reason
  // Job.employerId is Restrict: CompanyMember.employer and
  // TeamInvitation.employer are both ON DELETE CASCADE from EmployerProfile,
  // which is itself Cascade from User — so deleting the user who *created*
  // the company (EmployerProfile.userId; always also that same user's own
  // OWNER CompanyMember row, see EmployerRepository.createProfileForUser)
  // would otherwise silently delete every other teammate's seat and every
  // pending invite along with it. Returns zeros for a user with no
  // EmployerProfile (a TALENT, or an EMPLOYER who only ever joined someone
  // else's company via a team invite — CompanyMember.userId is @unique, so
  // that user never owns an EmployerProfile of their own to cascade from).
  async countTeamObligations(
    userId: string,
  ): Promise<{ members: number; pendingInvitations: number }> {
    const profile = await this.prisma.employerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) return { members: 0, pendingInvitations: 0 };

    const [members, pendingInvitations] = await Promise.all([
      this.prisma.companyMember.count({
        where: { employerId: profile.id, userId: { not: userId } },
      }),
      this.prisma.teamInvitation.count({
        where: { employerId: profile.id, status: "PENDING" },
      }),
    ]);
    return { members, pendingInvitations };
  }

  findPasswordHash(id: string): Promise<Pick<User, "passwordHash"> | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { passwordHash: true },
    });
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }
}
