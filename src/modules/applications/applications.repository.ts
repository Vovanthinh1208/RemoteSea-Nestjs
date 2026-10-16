import { Injectable } from "@nestjs/common";
import type {
  Application,
  ApplicationStatus,
  JobStatus,
  TalentProfile,
} from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import { MEMBERSHIP_SET_CAP } from "@/common/constants/membership-set.constants";
import {
  applicationPartiesSelect,
  type ApplicationParties,
} from "@/common/interfaces/application-parties.interface";
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
  WITHDRAWABLE_STATUSES,
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

  // Only the two fields apply() needs to decide whether the job still takes
  // applications; absent row and non-ACTIVE/expired row are told apart there.
  findJobForApply(
    jobId: string,
  ): Promise<{ status: JobStatus; expiresAt: Date | null } | null> {
    return this.prisma.job.findUnique({
      where: { id: jobId },
      select: { status: true, expiresAt: true },
    });
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

  // Scoped by talentId in the WHERE clause itself (not a separate ownership
  // guard) — a wrong-owner id returns null and turns into the same 404 as a
  // nonexistent id, so this never confirms another talent's application
  // exists. Same select as findByTalentId's list rows, so the detail page
  // gets the identical shape (including the statusEvents timeline).
  findByIdForTalent(
    id: string,
    talentId: string,
  ): Promise<ApplicationWithJob | null> {
    return this.prisma.application.findFirst({
      where: { id, talentId },
      select: {
        ...ownApplicationSelect,
        job: { select: jobListItemSelect },
      },
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

  /** Notification context (talent name, job title, employer userId/name) —
   * the same shape messages/interviews use for their own notifications, so
   * ApplicationsService.withdraw/respondToOffer can notify the other party
   * without carrying a second, differently-shaped select through this file. */
  findPartiesById(id: string): Promise<ApplicationParties | null> {
    return this.prisma.application.findUnique({
      where: { id },
      select: applicationPartiesSelect,
    });
  }

  // Talent-initiated self-withdraw. CAS on both ownership (talentId) and
  // eligibility (status still in WITHDRAWABLE_STATUSES) in the same
  // updateMany, so a status change that lands concurrently (e.g. the
  // employer rejecting it, or extending an offer, a moment before this
  // runs) can't silently be overwritten — count === 0 covers "not found",
  // "not owned," and "no longer withdrawable" alike, same ambiguity
  // findByIdForTalent's own ownership scoping already relies on elsewhere in
  // this file.
  async withdraw(
    id: string,
    talentId: string,
  ): Promise<ApplicationWithJob | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.application.updateMany({
        where: { id, talentId, status: { in: WITHDRAWABLE_STATUSES } },
        data: { status: "WITHDRAWN" },
      });
      if (count === 0) return null;

      await tx.applicationStatusEvent.create({
        data: { applicationId: id, status: "WITHDRAWN" },
      });
      return tx.application.findUnique({
        where: { id },
        select: {
          ...ownApplicationSelect,
          job: { select: jobListItemSelect },
        },
      });
    });
  }

  // Talent's response to an extended offer — same CAS shape as withdraw
  // above, gated on the application still being exactly OFFERED (a second
  // response attempt, or one that races a concurrent employer action,
  // matches zero rows and returns null).
  async respondToOffer(
    id: string,
    talentId: string,
    status: Extract<ApplicationStatus, "OFFER_ACCEPTED" | "OFFER_DECLINED">,
  ): Promise<ApplicationWithJob | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.application.updateMany({
        where: { id, talentId, status: "OFFERED" },
        data: { status },
      });
      if (count === 0) return null;

      await tx.applicationStatusEvent.create({
        data: { applicationId: id, status },
      });
      return tx.application.findUnique({
        where: { id },
        select: {
          ...ownApplicationSelect,
          job: { select: jobListItemSelect },
        },
      });
    });
  }
}
