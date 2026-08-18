import { Injectable } from "@nestjs/common";
import type {
  Application,
  ApplicationStatus,
  TalentProfile,
} from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import { MEMBERSHIP_SET_CAP } from "@/common/constants/membership-set.constants";
import {
  backloggedApplicationSelect,
  ownApplicationSelect,
  type ApplicationWithJob,
  type BackloggedApplication,
  type CreateApplicationInput,
  type OwnApplication,
} from "./interfaces";
import {
  BACKLOG_MAX_PER_RUN,
  BACKLOG_REMINDER_COOLDOWN_MS,
  BACKLOG_THRESHOLD_MS,
} from "./constants";
import { jobListItemSelect } from "@/common/types/job-list-item.type";
import {
  jobWithEmployerEmailInclude,
  type JobWithEmployerEmail,
} from "@/common/types/job-with-employer-email.type";

@Injectable()
export class ApplicationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTalentIdByUserId(
    userId: string,
  ): Promise<Pick<TalentProfile, "id"> | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  findTalentWithUserName(
    userId: string,
  ): Promise<(TalentProfile & { user: { name: string | null } }) | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      include: { user: { select: { name: true } } },
    });
  }

  async findByTalentId(
    talentId: string,
    skip: number,
    take: number,
  ): Promise<[ApplicationWithJob[], number]> {
    // The embedded job only feeds the dashboard's application rows (title,
    // country, company name) — the shared narrow job-card select, not every Job
    // column; previously the full row (description/requirements/responsibilities
    // included) was fetched and serialized per application.
    const [applications, total] = await Promise.all([
      this.prisma.application.findMany({
        where: { talentId },
        orderBy: { appliedAt: "desc" },
        skip,
        take,
        select: {
          ...ownApplicationSelect,
          job: { select: jobListItemSelect },
        },
      }),
      this.prisma.application.count({ where: { talentId } }),
    ]);
    return [applications, total];
  }

  /** Membership set (applied job ids) for client-side "already applied?" checks —
   * the ApplyButton twin of saved's findJobIdsForUser: no pagination, ids only
   * (see MEMBERSHIP_SET_CAP for why the cap isn't page-sized). */
  async findJobIdsByTalentId(talentId: string): Promise<string[]> {
    const rows = await this.prisma.application.findMany({
      where: { talentId },
      select: { jobId: true },
      take: MEMBERSHIP_SET_CAP,
    });
    return rows.map((row) => row.jobId);
  }

  /** DB-side status breakdown for dashboard stats — avoids shipping every row to the
   * client just to count them (see TalentDashboard's application-status tiles). */
  async getStatusCountsByTalentId(
    talentId: string,
  ): Promise<Array<{ status: ApplicationStatus; count: number }>> {
    const rows = await this.prisma.application.groupBy({
      by: ["status"],
      where: { talentId },
      _count: true,
    });
    return rows.map((row) => ({ status: row.status, count: row._count }));
  }

  findByJobAndTalent(
    jobId: string,
    talentId: string,
  ): Promise<Pick<Application, "id"> | null> {
    return this.prisma.application.findUnique({
      where: { jobId_talentId: { jobId, talentId } },
      select: { id: true },
    });
  }

  async createAndIncrementApplyCount(
    input: CreateApplicationInput,
  ): Promise<{ application: OwnApplication; job: JobWithEmployerEmail }> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.application.create({
        data: {
          jobId: input.jobId,
          talentId: input.talentId,
          coverLetter: input.coverLetter,
          resumeUrl: input.resumeUrl,
        },
        select: { id: true },
      });
      // Application Transparency's timeline starts here — every application
      // gets its initial PENDING event at creation, not just on later
      // transitions (see ApplicationStatusEvent's schema comment). Written
      // before the re-select below so the returned `statusEvents` already
      // includes it, instead of reflecting the pre-event snapshot.
      await tx.applicationStatusEvent.create({
        data: { applicationId: created.id, status: "PENDING" },
      });
      const [application, job] = await Promise.all([
        // ownApplicationSelect: the created row goes straight back to the
        // applicant in the POST /applications response — same talent-facing
        // shape as GET /applications (no employer `notes`).
        tx.application.findUniqueOrThrow({
          where: { id: created.id },
          select: ownApplicationSelect,
        }),
        tx.job.update({
          where: { id: input.jobId },
          data: { applyCount: { increment: 1 } },
          include: jobWithEmployerEmailInclude,
        }),
      ]);
      return { application, job };
    });
  }

  /** Employer Response SLA — applications stuck past their stage's threshold
   * (see BACKLOG_THRESHOLD_MS) and not reminded within the cooldown window.
   * PENDING is measured from appliedAt (never touched at all); REVIEWING
   * from updatedAt (time since it entered that stage — updatedAt only moves
   * on a real transition, see EmployerRepository.updateApplication). */
  findBacklogged(): Promise<BackloggedApplication[]> {
    const now = Date.now();
    const pendingCutoff = new Date(now - BACKLOG_THRESHOLD_MS.PENDING);
    const reviewingCutoff = new Date(now - BACKLOG_THRESHOLD_MS.REVIEWING);
    const cooldownCutoff = new Date(now - BACKLOG_REMINDER_COOLDOWN_MS);

    return this.prisma.application.findMany({
      where: {
        AND: [
          {
            OR: [
              { status: "PENDING", appliedAt: { lt: pendingCutoff } },
              { status: "REVIEWING", updatedAt: { lt: reviewingCutoff } },
            ],
          },
          {
            OR: [
              { lastReminderSentAt: null },
              { lastReminderSentAt: { lt: cooldownCutoff } },
            ],
          },
        ],
      },
      take: BACKLOG_MAX_PER_RUN,
      select: backloggedApplicationSelect,
    });
  }

  async markRemindersSent(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.application.updateMany({
      where: { id: { in: ids } },
      data: { lastReminderSentAt: new Date() },
    });
  }
}
