import { Injectable } from "@nestjs/common";
import { Prisma, type Job } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  buildCategoryFacetsQuery,
  buildFacetCountsQuery,
  buildSearchRankedIdsQuery,
  notExpiredCondition,
  type CategoryFacetRow,
  type FacetCountsRow,
} from "./job-search.util";
import { omitInternalJobFields } from "@/common/types/job-with-relations.type";
import {
  jobListItemSelect,
  type JobListItem,
} from "@/common/types/job-list-item.type";
import { PLAN_DURATION_DAYS } from "@/common/constants/plan.constants";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PublicJob = Omit<Job, "stripeSessionId" | "reviewNote">;

export type ExpiredJob = Pick<Job, "id" | "title" | "employerId">;

const jobDetailInclude = {
  employer: {
    select: {
      companyName: true,
      logoUrl: true,
      slug: true,
      isVerified: true,
      size: true,
      description: true,
      hqCountry: true,
    },
  },
  categories: { include: { category: true } },
  skills: { include: { skill: true } },
} satisfies Prisma.JobInclude;

@Injectable()
export class JobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(
    where: Prisma.JobWhereInput,
    skip: number,
    take: number,
    orderBy: Prisma.JobOrderByWithRelationInput[] = [
      { isFeatured: "desc" },
      { publishedAt: "desc" },
    ],
  ): Promise<JobListItem[]> {
    return this.prisma.job.findMany({
      where,
      skip,
      take,
      orderBy,
      select: jobListItemSelect,
    });
  }

  count(where: Prisma.JobWhereInput): Promise<number> {
    return this.prisma.job.count({ where });
  }

  // id-only, no joins — for JobsService.listBySearch to learn which of the
  // (already-ranked) search candidates also satisfy the other filters,
  // without paying for jobListItemSelect's employer/categories/skills joins
  // on rows that are only ever used to compute a page slice + total.
  findIds(where: Prisma.JobWhereInput): Promise<string[]> {
    return this.prisma.job
      .findMany({ where, select: { id: true } })
      .then((rows) => rows.map((row) => row.id));
  }

  // See buildFacetCountsQuery/buildCategoryFacetsQuery for why this is two
  // small aggregate queries instead of loading every active job into memory.
  // A bare aggregate with no GROUP BY always returns exactly one row (even
  // over zero matching jobs, every COUNT(*) FILTER is just 0), so rows[0] is
  // never actually missing.
  findFacetCounts(): Promise<FacetCountsRow> {
    return this.prisma
      .$queryRaw<FacetCountsRow[]>(buildFacetCountsQuery())
      .then((rows) => rows[0]!);
  }

  findCategoryFacetCounts(): Promise<CategoryFacetRow[]> {
    return this.prisma.$queryRaw<CategoryFacetRow[]>(
      buildCategoryFacetsQuery(),
    );
  }

  // Rank isn't a real jobs column, so Prisma's fluent client can't ORDER BY
  // it — the caller (JobsService.listBySearch) re-sorts a normal `findMany`
  // page using this array's order instead. `ids` is the already-filtered
  // candidate set (see buildSearchRankedIdsQuery for why ranking is scoped to
  // it rather than a LIMIT-capped scan) and the match/rank itself is computed
  // here in raw SQL.
  async findSearchRankedIds(q: string, ids: string[]): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(
      buildSearchRankedIdsQuery(q, ids),
    );
    return rows.map((row) => row.id);
  }

  // Expired is treated the same as CLOSED/REJECTED/DRAFT here — a plain 404,
  // not a distinct "this listing has expired" page, matching how every other
  // not-currently-live status already behaves on this route.
  async findActiveById(id: string) {
    const job = await this.prisma.job.findFirst({
      where: {
        id,
        status: "ACTIVE",
        employer: { user: { isPaused: false } },
        ...notExpiredCondition(),
      },
      include: jobDetailInclude,
    });
    return job && omitInternalJobFields(job);
  }

  // PB48 RC1: the same detail shape for a listing in any status, for the
  // company-member/ADMIN preview. Access is decided by JobsService.getById.
  async findPreviewById(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: jobDetailInclude,
    });
    return job && omitInternalJobFields(job);
  }

  // Backs JobOwnershipGuard + JobsService.update — narrow select, not the full Job
  // row: those are the only fields that method reads.
  findById(id: string) {
    return this.prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        salaryMin: true,
        salaryMax: true,
        employerId: true,
      },
    });
  }

  // updateMany (not update) so a job deleted between the view and the buffered
  // flush is a silent no-op instead of a thrown P2025.
  // One statement for the whole flush batch instead of one updateMany per job
  // id (see ViewCountBuffer.flush) — Prisma's updateMany can't apply a
  // different increment per row, so this drops to raw SQL with a VALUES list
  // to keep the per-flush query count constant regardless of how many
  // distinct jobs were viewed in the window. Ids that no longer exist (job
  // deleted between view and flush) simply match zero rows, same as before.
  async incrementViewCounts(counts: Map<string, number>): Promise<void> {
    if (counts.size === 0) return;

    const rows = Prisma.join(
      Array.from(counts, ([id, count]) => Prisma.sql`(${id}, ${count})`),
    );
    await this.prisma.$executeRaw`
      UPDATE "jobs" AS j
      SET "viewCount" = j."viewCount" + v.count
      FROM (VALUES ${rows}) AS v(id, count)
      WHERE j.id = v.id
    `;
  }

  create(data: Prisma.JobCreateInput) {
    return this.prisma.job.create({
      data,
      select: { id: true, slug: true, status: true },
    });
  }

  async update(id: string, data: Prisma.JobUpdateInput): Promise<PublicJob> {
    const job = await this.prisma.job.update({ where: { id }, data });
    return omitInternalJobFields(job);
  }

  // Only writes if the job is still DRAFT/REJECTED, so an owner's edit can't
  // silently land on a job an admin concurrently approved/rejected in between.
  async updateIfEditable(
    id: string,
    data: Prisma.JobUpdateInput,
  ): Promise<PublicJob | null> {
    const { count } = await this.prisma.job.updateMany({
      where: { id, status: { in: ["DRAFT", "REJECTED"] } },
      data,
    });
    if (count === 0) return null;

    const job = await this.prisma.job.findUnique({ where: { id } });
    return job && omitInternalJobFields(job);
  }

  // Same conditional-updateMany shape as updateIfEditable/approveJob below —
  // "close" only ever makes sense starting from ACTIVE (closing a DRAFT or
  // PENDING_REVIEW job isn't "closing a listing," it's withdrawing one,
  // a different, unrequested action), and the atomic re-check means a job
  // that expired or got closed a second ago between the caller's read and
  // this write can't silently re-close.
  async closeJob(id: string): Promise<Pick<Job, "status"> | null> {
    const { count } = await this.prisma.job.updateMany({
      where: { id, status: "ACTIVE" },
      data: { status: "CLOSED" },
    });
    if (count === 0) return null;
    return this.prisma.job.findUnique({
      where: { id },
      select: { status: true },
    });
  }

  // Conditional updateMany (not a plain update) — re-checks PENDING_REVIEW
  // atomically at write time, same reasoning as updateIfEditable above.
  // Without this, two concurrent admin reviews of the same job (or a review
  // racing another status change) could both pass AdminService.reviewJob's
  // upfront status check and double-fire the approve email + write. Owned
  // here (not AdminRepository) since Job status transitions are this
  // module's domain rule regardless of which module triggers them.
  async approveJob(
    id: string,
  ): Promise<Pick<Job, "status" | "publishedAt" | "expiresAt"> | null> {
    // planType is immutable after creation — safe to read before the CAS
    // write below for the same reason as BillingRepository.
    // markJobPaidAndSubmitted. Anchored on publishedAt (the moment the
    // listing actually goes live), not paidAt: a job that sits in
    // PENDING_REVIEW for days waiting on manual admin approval shouldn't
    // lose those days off its paid-for listing window.
    const job = await this.prisma.job.findUnique({
      where: { id },
      select: { planType: true },
    });
    if (!job) return null;

    const publishedAt = new Date();
    const durationDays = PLAN_DURATION_DAYS[job.planType];
    const expiresAt =
      durationDays === null
        ? null
        : new Date(publishedAt.getTime() + durationDays * DAY_MS);

    const { count } = await this.prisma.job.updateMany({
      where: { id, status: "PENDING_REVIEW" },
      data: { status: "ACTIVE", publishedAt, reviewNote: null, expiresAt },
    });
    if (count === 0) return null;

    return this.prisma.job.findUnique({
      where: { id },
      select: { status: true, publishedAt: true, expiresAt: true },
    });
  }

  async rejectJob(
    id: string,
    note: string | null,
  ): Promise<Pick<Job, "status" | "publishedAt"> | null> {
    const { count } = await this.prisma.job.updateMany({
      where: { id, status: "PENDING_REVIEW" },
      data: { status: "REJECTED", reviewNote: note, rejectedAt: new Date() },
    });
    if (count === 0) return null;

    return this.prisma.job.findUnique({
      where: { id },
      select: { status: true, publishedAt: true },
    });
  }

  // Plain updateMany (no CAS re-read needed) — every row this WHERE matches
  // is, by definition, still ACTIVE and past its expiry, so there's no
  // "expected previous state" to race against the way approveJob/rejectJob
  // guard a single specific row does. A row that a concurrent request moves
  // out of ACTIVE (e.g. the owner closing it) between this query planning
  // and executing simply no longer matches — Postgres's own MVCC snapshot
  // for the UPDATE statement handles that, no application-level check
  // needed on top.
  // Returns the jobs this run actually moved to EXPIRED (PB46 AC4 emails
  // their company's OWNER/RECRUITER members). The UPDATE ... RETURNING keeps
  // it one statement, so a job is reported by exactly one concurrent run.
  expireStaleJobs(): Promise<ExpiredJob[]> {
    return this.prisma.$queryRaw<ExpiredJob[]>`
      UPDATE "jobs"
      SET "status" = 'EXPIRED', "updatedAt" = NOW()
      WHERE "status" = 'ACTIVE' AND "expiresAt" < NOW()
      RETURNING "id", "title", "employerId"
    `;
  }

  // Who hears about an expired listing: the members who manage jobs.
  async findJobManagerEmails(
    employerIds: string[],
  ): Promise<Map<string, string[]>> {
    const members = await this.prisma.companyMember.findMany({
      where: {
        employerId: { in: employerIds },
        role: { in: ["OWNER", "RECRUITER"] },
      },
      select: { employerId: true, user: { select: { email: true } } },
    });
    const byEmployer = new Map<string, string[]>();
    for (const m of members) {
      byEmployer.set(m.employerId, [
        ...(byEmployer.get(m.employerId) ?? []),
        m.user.email,
      ]);
    }
    return byEmployer;
  }
}
