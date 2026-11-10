import { Injectable } from "@nestjs/common";
import type { JobAlert, Prisma } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  jobWithRelationsInclude,
  type JobWithRelations,
} from "@/common/types/job-with-relations.type";
import { MAX_ALERTS_PER_RUN } from "./constants";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const alertWithCategoriesInclude = {
  categories: { include: { category: true } },
} satisfies Prisma.JobAlertInclude;

type AlertWithCategories = Prisma.JobAlertGetPayload<{
  include: typeof alertWithCategoriesInclude;
}>;

// Mirrors EmployerRepository's EMPLOYER_JOBS_LIST_CAP: creation is only
// rate-limited (RATE_LIMITS.CREATE), not capped in total, so without this a
// long-lived account could accumulate an unbounded number of alerts and every
// GET /alerts would fetch all of them plus their category joins.
const USER_ALERTS_LIST_CAP = 200;

@Injectable()
export class AlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string): Promise<AlertWithCategories[]> {
    return this.prisma.jobAlert.findMany({
      where: { userId },
      take: USER_ALERTS_LIST_CAP,
      include: alertWithCategoriesInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  countByUser(userId: string): Promise<number> {
    return this.prisma.jobAlert.count({
      where: { userId },
    });
  }

  create(
    userId: string,
    alertData: Omit<
      Prisma.JobAlertUncheckedCreateInput,
      "userId" | "categories"
    >,
    categoryIds: string[] | undefined,
  ): Promise<AlertWithCategories> {
    return this.prisma.$transaction(async (tx) => {
      // Serialize creations for this user across processes, including when no
      // alerts exist yet. A count followed by an unlocked insert exceeds five.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      if ((await tx.jobAlert.count({ where: { userId } })) >= 5) {
        throw new BadRequestApiException(
          "Maximum 5 job alerts allowed per user",
          ErrorCode.ALERT_LIMIT_REACHED,
        );
      }
      await this.validateCategories(tx, categoryIds);
      return tx.jobAlert.create({
        data: {
          ...alertData,
          userId,
          ...(categoryIds?.length && {
            categories: {
              create: categoryIds.map((id) => ({ categoryId: id })),
            },
          }),
        },
        include: alertWithCategoriesInclude,
      });
    });
  }

  findOwnerById(id: string): Promise<Pick<JobAlert, "id" | "userId"> | null> {
    return this.prisma.jobAlert.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
  }

  updateActive(id: string, isActive: boolean): Promise<JobAlert> {
    return this.prisma.jobAlert.update({ where: { id }, data: { isActive } });
  }

  async updateAlert(
    id: string,
    data: Prisma.JobAlertUpdateInput,
    categoryIds?: string[],
  ): Promise<AlertWithCategories> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM job_alerts WHERE id = ${id} FOR UPDATE`;
      await this.validateCategories(tx, categoryIds);
      if (categoryIds !== undefined) {
        await tx.alertCategory.deleteMany({ where: { alertId: id } });
      }
      return tx.jobAlert.update({
        where: { id },
        data: {
          ...data,
          ...(categoryIds?.length && {
            categories: {
              create: categoryIds.map((categoryId) => ({ categoryId })),
            },
          }),
        },
        include: alertWithCategoriesInclude,
      });
    });
  }

  private async validateCategories(
    tx: Prisma.TransactionClient,
    ids?: string[],
  ) {
    if (!ids?.length) return;
    const unique = [...new Set(ids)];
    if (
      unique.length !== ids.length ||
      (await tx.category.count({ where: { id: { in: unique } } })) !==
        unique.length
    ) {
      throw new BadRequestApiException("Invalid or duplicate alert categories");
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.jobAlert.delete({ where: { id } });
  }

  // Bounded + ordered oldest-sent-first (never-sent alerts first) so a large
  // table doesn't turn one cron run into an unbounded pass — alerts left over
  // get priority on the next tick instead of starving behind newer ones.
  findActiveAlerts() {
    return this.prisma.jobAlert.findMany({
      // PB16: a paused account is hidden from public search and must stop
      // receiving new-job email alerts until it is reactivated.
      where: {
        isActive: true,
        user: { isPaused: false, bannedAt: null, role: "TALENT" },
      },
      take: MAX_ALERTS_PER_RUN,
      orderBy: { lastSentAt: { sort: "asc", nulls: "first" } },
      include: {
        categories: { select: { categoryId: true } },
        user: { select: { email: true } },
      },
    });
  }

  findMatchingJobs(where: Prisma.JobWhereInput): Promise<JobWithRelations[]> {
    return this.prisma.job.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      include: jobWithRelationsInclude,
    }) as Promise<JobWithRelations[]>;
  }

  // Atomically claims an alert for sending: the update only applies if
  // lastSentAt still matches what the caller read, so two concurrent cron
  // runs (e.g. an overlapping retry) can't both send for the same alert.
  async claimForSend(
    id: string,
    expectedLastSentAt: Date | null,
    claimedAt = new Date(),
  ): Promise<boolean> {
    const { count } = await this.prisma.jobAlert.updateMany({
      where: { id, isActive: true, lastSentAt: expectedLastSentAt },
      data: { lastSentAt: claimedAt },
    });
    return count === 1;
  }

  async releaseFailedSend(
    id: string,
    claimedAt: Date,
    previous: Date | null,
  ): Promise<void> {
    await this.prisma.jobAlert.updateMany({
      where: { id, lastSentAt: claimedAt },
      data: { lastSentAt: previous },
    });
  }

  /** Self-contained narrow query (not a cross-import of UsersRepository) —
   * same reasoning as InvitationsRepository.employerMessagesEnabled. Only
   * consulted for WEEKLY-frequency alerts — see AlertsService.dispatchOne. */
  async weeklyDigestEnabled(userId: string): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: { weeklyDigest: true },
    });
    // No row yet (never opened Settings > Notifications) — the schema
    // default for weeklyDigest is true, so an absent row means "on".
    return pref?.weeklyDigest ?? true;
  }

  /** Same shape as weeklyDigestEnabled above, for the IMMEDIATE/DAILY
   * cadences — Settings > Notifications' "Instant high-match alerts"
   * toggle. Only consulted for non-WEEKLY alerts — see
   * AlertsService.dispatchOne. */
  async instantMatchAlertsEnabled(userId: string): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: { instantMatchAlerts: true },
    });
    // No row yet — the schema default for instantMatchAlerts is true, so an
    // absent row means "on", same convention as every other preference here.
    return pref?.instantMatchAlerts ?? true;
  }
}
