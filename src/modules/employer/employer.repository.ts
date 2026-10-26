import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  Application,
  ApplicationStatus,
  EmployerProfile,
  JobStatus,
} from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  jobListItemSelect,
  type JobListItem,
} from "@/common/types/job-list-item.type";
import { notExpiredCondition } from "@/modules/jobs/job-search.util";

const EMPLOYER_JOBS_LIST_CAP = 200;
const COMPANY_PROFILE_JOBS_CAP = 50;
// The dashboard's "Recent applicants" panel used to be assembled by the
// frontend firing one GET /employer/jobs/:id/applications request per job
// with any applicants (via useQueries) and merging the results client-side —
// an employer with N active listings paid N full request/auth/DB round
// trips just to render one panel. This single company-wide query replaces
// all of them. Same order of magnitude as EMPLOYER_JOBS_LIST_CAP's
// reasoning: a hard cap instead of pagination, since this is a fixed-size
// "recent activity" view, not a paginated list a caller pages through.
const RECENT_APPLICATIONS_LIST_CAP = 300;

// GET /companies/:slug is unauthenticated — explicit select so every public
// field is a decision, not an accident (same reasoning as talent's
// publicProfileArgs). verificationEmail/verificationStatus are deliberately
// excluded — those are self-service-verification internals, not something
// an employer asked to publish; isVerified/verifiedAt are the public-facing
// signal that self-service verification (among other paths) can flip.
const publicProfileSelect = {
  id: true,
  userId: true,
  companyName: true,
  slug: true,
  logoUrl: true,
  websiteUrl: true,
  description: true,
  industry: true,
  size: true,
  founded: true,
  hqCountry: true,
  hqCity: true,
  hqAddress: true,
  benefits: true,
  linkedinUrl: true,
  facebookUrl: true,
  videoUrl: true,
  coverImageUrl: true,
  isVerified: true,
  verifiedAt: true,
  createdAt: true,
} satisfies Prisma.EmployerProfileSelect;

export type PublicCompanyProfile = Prisma.EmployerProfileGetPayload<{
  select: typeof publicProfileSelect;
}>;

const profileSelect = {
  id: true,
  companyName: true,
  slug: true,
  logoUrl: true,
  websiteUrl: true,
  description: true,
  industry: true,
  size: true,
  founded: true,
  hqCountry: true,
  hqCity: true,
  hqAddress: true,
  benefits: true,
  linkedinUrl: true,
  facebookUrl: true,
  videoUrl: true,
  coverImageUrl: true,
  isVerified: true,
  verificationEmail: true,
  verificationStatus: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployerProfileSelect;

export type PublicEmployerProfile = Prisma.EmployerProfileGetPayload<{
  select: typeof profileSelect;
}>;

const profileWithJobCountSelect = {
  ...profileSelect,
  _count: { select: { jobs: true } },
} satisfies Prisma.EmployerProfileSelect;

export type ProfileWithJobCount = Prisma.EmployerProfileGetPayload<{
  select: typeof profileWithJobCountSelect;
}>;

@Injectable()
export class EmployerRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProfileByUserId(
    userId: string,
  ): Promise<{ id: string; logoUrl: string | null } | null> {
    return this.prisma.employerProfile.findUnique({
      where: { userId },
      select: { id: true, logoUrl: true },
    });
  }

  // Multi-seat twin of findProfileByUserId — a team member's caller-facing
  // "my company" resolves through CompanyMember.employerId
  // (CompanyMembershipService.resolveMembership), not EmployerProfile.userId,
  // since only the company's original creator has a row keyed on their own
  // userId.
  findProfileByCompanyId(employerId: string): Promise<{
    id: string;
    logoUrl: string | null;
    coverImageUrl: string | null;
  } | null> {
    return this.prisma.employerProfile.findUnique({
      where: { id: employerId },
      select: { id: true, logoUrl: true, coverImageUrl: true },
    });
  }

  findProfileBySlug(slug: string): Promise<{ id: string } | null> {
    return this.prisma.employerProfile.findUnique({
      where: { slug },
      select: { id: true },
    });
  }

  findPublicProfileBySlug(slug: string): Promise<PublicCompanyProfile | null> {
    // findFirst, not findUnique: PB33 serves only an active company, so a
    // suspended one (suspendedAt set by the admin action) answers 404 like a
    // slug that doesn't exist.
    return this.prisma.employerProfile.findFirst({
      where: { slug, suspendedAt: null },
      select: publicProfileSelect,
    });
  }

  // vnHireCount is summed across every job regardless of status — it's a
  // cumulative "we've hired N people in Vietnam through this company"
  // track-record signal, not tied to which listings currently happen to be
  // open.
  async getPublicCompanyStats(
    employerId: string,
  ): Promise<{ activeJobCount: number; vnHireTotal: number }> {
    const [activeJobCount, vnHireAgg] = await Promise.all([
      this.prisma.job.count({
        where: { employerId, status: "ACTIVE", ...notExpiredCondition() },
      }),
      this.prisma.job.aggregate({
        where: { employerId },
        _sum: { vnHireCount: true },
      }),
    ]);
    return {
      activeJobCount,
      vnHireTotal: vnHireAgg._sum.vnHireCount ?? 0,
    };
  }

  // Reuses jobListItemSelect (the exact shape JobCard already renders) so
  // the company profile page can drop these straight into the same
  // component, nested `employer` redundancy and all — no new frontend type.
  findActiveJobsForCompany(employerId: string): Promise<JobListItem[]> {
    return this.prisma.job.findMany({
      where: { employerId, status: "ACTIVE", ...notExpiredCondition() },
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
      take: COMPANY_PROFILE_JOBS_CAP,
      select: jobListItemSelect,
    });
  }

  async createProfileForUser(
    userId: string,
    data: {
      companyName: string;
      websiteUrl?: string;
      description?: string;
      industry?: string;
      size?: string;
      hqCountry?: string;
      hqCity?: string;
    },
    slug: string,
  ): Promise<{ id: string; slug: string; companyName: string }> {
    const [, profile] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { role: "EMPLOYER" },
      }),
      // Multi-seat: the creator's own OWNER seat, via the same nested-create
      // (still one atomic statement, no interactive transaction needed) —
      // every authorization check from here on reads CompanyMember, not
      // EmployerProfile.userId, so this row is what actually makes the
      // creator able to use their own company.
      this.prisma.employerProfile.create({
        data: {
          ...data,
          userId,
          slug,
          members: { create: { userId, role: "OWNER" } },
        },
        select: { id: true, slug: true, companyName: true },
      }),
    ]);
    return profile;
  }

  findProfileWithJobCount(
    employerId: string,
  ): Promise<ProfileWithJobCount | null> {
    return this.prisma.employerProfile.findUnique({
      where: { id: employerId },
      select: profileWithJobCountSelect,
    });
  }

  // A single aggregate instead of loading every job row's per-job application
  // count into memory just to sum them (the previous approach, and also
  // unbounded — unlike findJobsByEmployer it had no cap on job count either).
  countApplicationsForOwner(employerId: string): Promise<number> {
    return this.prisma.application.count({
      where: { job: { employerId } },
    });
  }

  updateProfile(
    id: string,
    data: Prisma.EmployerProfileUpdateInput,
  ): Promise<PublicEmployerProfile> {
    return this.prisma.employerProfile.update({
      where: { id },
      data,
      select: profileSelect,
    });
  }

  setVerified(id: string, isVerified: boolean): Promise<EmployerProfile> {
    return this.prisma.employerProfile.update({
      where: { id },
      // Only stamps verifiedAt when actually becoming verified — the
      // suspend() path below is the one dedicated route to isVerified=false
      // today, and it stamps its own suspendedAt instead. Re-verifying also
      // clears suspendedAt: "verify" is the only admin action that flips
      // isVerified back to true, so it has to double as "un-suspend" too —
      // suspendedAt now actually gates every company-role guard/check
      // (CompanyOwnershipGuardBase, requireCompanyRole), so leaving it set
      // here would make a suspension permanent with no way to lift it.
      data: {
        isVerified,
        ...(isVerified && { verifiedAt: new Date(), suspendedAt: null }),
      },
    });
  }

  // Single transaction, not two separate writes: an employer left verified
  // with all jobs closed (or suspended with jobs still live) is a worse
  // inconsistency than the suspend failing outright. Moved here (from
  // AdminRepository) since "what does suspending an employer mean" — the
  // isVerified flip and the job-closing cascade together — is this module's
  // domain rule to own, not Admin's to reimplement.
  async suspend(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.employerProfile.update({
        where: { id },
        data: { isVerified: false, suspendedAt: new Date() },
      }),
      this.prisma.job.updateMany({
        where: { employerId: id, status: "ACTIVE" },
        data: { status: "CLOSED" },
      }),
    ]);
  }

  // Narrower than findProfileWithJobCount — EmployerService.submitVerification
  // only needs enough to validate the domain-match and address the email.
  findProfileForVerification(employerId: string) {
    return this.prisma.employerProfile.findUnique({
      where: { id: employerId },
      select: { id: true, companyName: true, websiteUrl: true },
    });
  }

  // Deletes any prior unconsumed row for this employer first (an employer
  // resubmitting with a new/different address should invalidate the old
  // link, not leave two live tokens), then creates the fresh one and marks
  // the profile PENDING — one transaction so a submit can't half-apply.
  async createEmailVerification(
    employerId: string,
    email: string,
    token: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.employerEmailVerification.deleteMany({
        where: { employerId, consumedAt: null },
      }),
      this.prisma.employerEmailVerification.create({
        data: { employerId, email, token, expiresAt },
      }),
      this.prisma.employerProfile.update({
        where: { id: employerId },
        data: { verificationEmail: email, verificationStatus: "PENDING" },
      }),
    ]);
  }

  // The one code an employer can still enter: createEmailVerification
  // deletes every earlier unconsumed row, so there is at most one.
  findPendingEmailVerification(employerId: string) {
    return this.prisma.employerEmailVerification.findFirst({
      where: { employerId, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  // Atomic increment so concurrent wrong guesses are all counted.
  async recordFailedVerificationAttempt(id: string): Promise<number> {
    const { attempts } = await this.prisma.employerEmailVerification.update({
      where: { id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return attempts;
  }

  // A code that hit the attempt limit or expired can never be used again.
  async burnEmailVerification(id: string, employerId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.employerEmailVerification.updateMany({
        where: { id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.employerProfile.update({
        where: { id: employerId },
        data: { verificationStatus: "FAILED" },
      }),
    ]);
  }

  findEmailVerificationByToken(token: string) {
    return this.prisma.employerEmailVerification.findUnique({
      where: { token },
    });
  }

  markVerificationFailed(employerId: string): Promise<EmployerProfile> {
    return this.prisma.employerProfile.update({
      where: { id: employerId },
      data: { verificationStatus: "FAILED" },
    });
  }

  // Conditional updateMany (consumedAt: null), not a plain update — same
  // single-use-under-a-race guarantee as EmployerRepository.updateApplication
  // and AuthRepository.consumePasswordReset: two concurrent confirms of the
  // same token can't both flip isVerified. Returns false if the row was
  // already consumed (or never existed) by the time this runs.
  async consumeEmailVerification(
    verificationId: string,
    employerId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.employerEmailVerification.updateMany({
        where: { id: verificationId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (count === 0) return false;

      await tx.employerProfile.update({
        where: { id: employerId },
        data: {
          isVerified: true,
          verifiedAt: new Date(),
          verificationStatus: "VERIFIED",
        },
      });
      return true;
    });
  }

  findJobsByEmployer(employerId: string, status?: JobStatus) {
    return this.prisma.job.findMany({
      where: { employerId, ...(status && { status }) },
      orderBy: { createdAt: "desc" },
      // Scoped to one employer's own jobs (not attacker-scalable across the DB),
      // but unlike every other list endpoint this one has no pagination at all —
      // a hard cap avoids an unbounded query for an employer with a very long
      // posting history, without changing the response shape the frontend expects.
      take: EMPLOYER_JOBS_LIST_CAP,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        planType: true,
        planPaid: true,
        viewCount: true,
        applyCount: true,
        publishedAt: true,
        createdAt: true,
        _count: { select: { applications: true } },
        // Below: not rendered by the jobs list itself — carried so the
        // frontend can score this job's applicants against it (see
        // ApplicantsPanel's match badge) without a second fetch.
        level: true,
        salaryMin: true,
        salaryMax: true,
        currency: true,
        jobType: true,
        timezone: true,
        country: true,
        isRemote: true,
        skills: {
          select: {
            isRequired: true,
            // name: needed by match.util.ts's missingSkills — the client
            // shows a required-skill's name in the applicant match badge's
            // tooltip (see MatchBadge.tsx), not just its id.
            skill: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async getEmployerJobStats(employerId: string): Promise<{
    totalApps: number;
    shortlisted: number;
    avgTimeToHireInDays: number;
    avgFirstResponseHours: number;
  }> {
    const [totalApps, shortlisted, avgRows, avgResponseRows] =
      await Promise.all([
        this.prisma.application.count({ where: { job: { employerId } } }),
        this.prisma.application.count({
          where: { job: { employerId }, status: "SHORTLISTED" },
        }),
        // Averages appliedAt -> updatedAt in SQL instead of pulling every OFFERED
        // application row (unbounded per employer) into app memory just to
        // average two dates in JS.
        this.prisma.$queryRaw<Array<{ avgDays: number | null }>>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (a."updatedAt" - a."appliedAt")) / 86400.0)::float AS "avgDays"
        FROM applications a
        JOIN jobs j ON j.id = a."jobId"
        WHERE j."employerId" = ${employerId} AND a.status = 'OFFERED'
      `),
        // Application Transparency's SLA metric: time from appliedAt to the
        // first ApplicationStatusEvent that isn't the initial PENDING one —
        // i.e. the first real employer action, regardless of which status it
        // moved to. Only over applications that have such an event (an
        // untouched PENDING application has no "response" to average yet).
        this.prisma.$queryRaw<Array<{ avgHours: number | null }>>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (first_event."createdAt" - a."appliedAt")) / 3600.0)::float AS "avgHours"
        FROM applications a
        JOIN jobs j ON j.id = a."jobId"
        JOIN LATERAL (
          SELECT MIN(e."createdAt") AS "createdAt"
          FROM application_status_events e
          WHERE e."applicationId" = a.id AND e.status != 'PENDING'
        ) first_event ON first_event."createdAt" IS NOT NULL
        WHERE j."employerId" = ${employerId}
      `),
      ]);

    const avgDays = avgRows[0]?.avgDays ?? null;
    const avgHours = avgResponseRows[0]?.avgHours ?? null;
    return {
      totalApps,
      shortlisted,
      avgTimeToHireInDays: avgDays === null ? 0 : Math.round(avgDays * 10) / 10,
      avgFirstResponseHours:
        avgHours === null ? 0 : Math.round(avgHours * 10) / 10,
    };
  }

  // Hiring funnel dashboard chart: how many DISTINCT applications ever
  // reached each status, across every one of this employer's jobs. Distinct
  // is the reason this is raw SQL rather than a Prisma groupBy(['status'])
  // — an application that bounced REVIEWING -> SHORTLISTED -> REVIEWING
  // (an employer moving someone back a stage) would otherwise be double
  // counted at REVIEWING, since ApplicationStatusEvent is a full transition
  // log, not a current-state table. One row per status that was ever
  // reached at least once; a status with zero events for this employer
  // simply doesn't appear — the caller (EmployerService.getHiringFunnel /
  // buildFunnelStages) fills in the gaps with 0.
  async getApplicationFunnelCounts(
    employerId: string,
  ): Promise<Array<{ status: ApplicationStatus; count: number }>> {
    return this.prisma.$queryRaw<
      Array<{ status: ApplicationStatus; count: number }>
    >(Prisma.sql`
      SELECT e.status AS "status", COUNT(DISTINCT e."applicationId")::int AS "count"
      FROM application_status_events e
      JOIN applications a ON a.id = e."applicationId"
      JOIN jobs j ON j.id = a."jobId"
      WHERE j."employerId" = ${employerId}
      GROUP BY e.status
    `);
  }

  // Public-facing counterpart to getEmployerJobStats's avgFirstResponseHours —
  // same "first non-PENDING ApplicationStatusEvent" definition of "response,"
  // but also returns the sample count so the caller can gate on a minimum
  // before showing a number nobody asked this employer to publish. Unlike
  // the private version, does NOT collapse "no data" to 0 — respondedCount
  // is the only signal for that, avgHours stays null.
  async getPublicResponseStats(
    employerId: string,
  ): Promise<{ avgHours: number | null; respondedCount: number }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ avgHours: number | null; respondedCount: number }>
    >(Prisma.sql`
      SELECT
        COUNT(*)::int AS "respondedCount",
        AVG(EXTRACT(EPOCH FROM (first_event."createdAt" - a."appliedAt")) / 3600.0)::float AS "avgHours"
      FROM applications a
      JOIN jobs j ON j.id = a."jobId"
      JOIN LATERAL (
        SELECT MIN(e."createdAt") AS "createdAt"
        FROM application_status_events e
        WHERE e."applicationId" = a.id AND e.status != 'PENDING'
      ) first_event ON first_event."createdAt" IS NOT NULL
      WHERE j."employerId" = ${employerId}
    `);
    const row = rows[0];
    return {
      avgHours:
        row?.avgHours == null ? null : Math.round(row.avgHours * 10) / 10,
      respondedCount: row?.respondedCount ?? 0,
    };
  }

  findJobWithEmployerOwner(id: string) {
    return this.prisma.job.findUnique({
      where: { id },
      select: { id: true, employerId: true },
    });
  }

  async findApplicationsForJob(
    jobId: string,
    status: ApplicationStatus | undefined,
    skip: number,
    take: number,
  ) {
    const where: Prisma.ApplicationWhereInput = {
      jobId,
      ...(status && { status }),
    };
    const [applications, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        skip,
        take,
        orderBy: { appliedAt: "desc" },
        select: {
          id: true,
          status: true,
          appliedAt: true,
          viewedAt: true,
          // Only real transitions bump updatedAt (see updateApplication's
          // notes-only guard) — this is "time since entering the current
          // status," the same measure the backlog-reminder cron uses for
          // REVIEWING, so ApplicantsPanel's indicator can match it exactly.
          updatedAt: true,
          coverLetter: true,
          resumeUrl: true,
          // Previously write-only from the frontend's perspective (only ever
          // sent alongside a status-change PATCH, never read back) — the
          // Candidate Notes UI needs to display an existing note before
          // editing it.
          notes: true,
          talent: {
            select: {
              id: true,
              slug: true,
              headline: true,
              level: true,
              user: { select: { name: true } },
              skills: { include: { skill: true } },
              // Below: same "not rendered directly, feeds the frontend's
              // match-score calculation against the job" rationale as the
              // job fields added to findJobsByEmployer's select above —
              // already surfaced to anyone viewing this talent's public
              // profile (see talent/interfaces.ts's publicProfileArgs).
              yearsExperience: true,
              desiredSalaryMin: true,
              desiredSalaryMax: true,
              currency: true,
              timezone: true,
              country: true,
              employmentTypes: true,
              timezoneOverlap: true,
              rightToWork: true,
              // noticePeriod feeds the same match-score calculation as the
              // block above (see match.util.ts's scoreAvailability).
              // isOpenToWork doesn't — it's read only to decide whether
              // ApplicantsPanel's AvailabilityBadge renders at all (an
              // applicant can have since turned it off after applying).
              noticePeriod: true,
              isOpenToWork: true,
            },
          },
        },
      }),
      this.prisma.application.count({ where }),
    ]);

    // Application Transparency: this list view IS the "employer looked at
    // it" signal (see the plan's confirmed default — no separate detail
    // page exists to hang a more granular action off). Stamped once; the
    // IS-NULL-implied filter below makes repeat views a no-op. The
    // in-memory patch means this same response already reflects the
    // stamp instead of the caller needing a second fetch to see it.
    await this.stampViewedApplications(applications);

    return { applications, total };
  }

  // Company-wide twin of findApplicationsForJob above — same select shape
  // (kept in sync by hand; see that method's own field-by-field comments
  // for why each one is there) plus jobId/job.title, since a response
  // spanning many jobs can no longer let the caller infer which job an
  // application belongs to from request context alone. No `status`/skip
  // filter — this feeds one fixed "recent activity" view, not a paginated
  // list, so it takes no query params at all.
  async findRecentApplicationsForCompany(employerId: string) {
    const applications = await this.prisma.application.findMany({
      where: { job: { employerId } },
      take: RECENT_APPLICATIONS_LIST_CAP,
      orderBy: { appliedAt: "desc" },
      select: {
        id: true,
        status: true,
        appliedAt: true,
        updatedAt: true,
        coverLetter: true,
        resumeUrl: true,
        notes: true,
        viewedAt: true,
        jobId: true,
        job: { select: { title: true } },
        talent: {
          select: {
            id: true,
            slug: true,
            headline: true,
            level: true,
            user: { select: { name: true } },
            skills: { include: { skill: true } },
            yearsExperience: true,
            desiredSalaryMin: true,
            desiredSalaryMax: true,
            currency: true,
            timezone: true,
            country: true,
            employmentTypes: true,
            timezoneOverlap: true,
            rightToWork: true,
            noticePeriod: true,
            isOpenToWork: true,
          },
        },
      },
    });

    // Same Application Transparency stamping as findApplicationsForJob —
    // this view is just as much "the employer looked at it" as the
    // per-job one was, and previously *was* implemented as N calls to
    // that exact method, so preserving this side effect keeps behavior
    // identical, not just the response shape.
    await this.stampViewedApplications(applications);

    return applications;
  }

  // Shared by findApplicationsForJob and findRecentApplicationsForCompany,
  // which previously each hand-wrote this exact stamp-then-patch-back logic
  // independently. Set, not Array.includes, for the patch-back lookup —
  // applications here is the same list unviewedIds was derived from, so an
  // O(n) includes() scan per row would make the whole patch-back O(n^2) on
  // a list that's already known to be a superset of unviewedIds.
  private async stampViewedApplications<
    T extends { id: string; viewedAt: Date | null },
  >(applications: T[]): Promise<void> {
    const unviewedIds = applications
      .filter((a) => a.viewedAt === null)
      .map((a) => a.id);
    if (unviewedIds.length === 0) return;

    const now = new Date();
    await this.prisma.application.updateMany({
      where: { id: { in: unviewedIds } },
      data: { viewedAt: now },
    });
    const unviewedSet = new Set(unviewedIds);
    for (const a of applications) {
      if (unviewedSet.has(a.id)) a.viewedAt = now;
    }
  }

  findApplicationWithJobOwner(id: string) {
    return this.prisma.application.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        talent: {
          select: {
            userId: true,
            user: { select: { name: true, email: true } },
          },
        },
        // employerId (scalar) is what the multi-seat guards resolve company
        // membership against; the nested employer{userId,companyName} object
        // is kept as-is because messages/interviews services structurally
        // depend on this exact shape matching ApplicationParties (see
        // common/interfaces/application-parties.interface.ts's comment).
        job: {
          select: {
            title: true,
            employerId: true,
            employer: {
              select: { userId: true, companyName: true },
            },
          },
        },
        interview: { select: { interviewerId: true } },
      },
    });
  }

  // Only writes if status still matches what the caller last read, so two
  // concurrent PATCHes against the same application can't silently overwrite
  // one another (last-write-wins). Returns null if the row moved underneath us.
  // Interactive transaction (not the array form) because the
  // ApplicationStatusEvent write below is conditional on the updateMany
  // actually having matched — a no-op status-transition attempt shouldn't
  // add a spurious event to Application Transparency's timeline.
  async updateApplication(
    id: string,
    expectedStatus: ApplicationStatus,
    status: ApplicationStatus,
    notes: string | undefined,
  ): Promise<Application | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.application.updateMany({
        where: { id, status: expectedStatus },
        data: { status, ...(notes !== undefined && { notes }) },
      });
      if (count === 0) return null;

      // A notes-only save (status === expectedStatus, e.g. no real
      // transition) must not log a spurious duplicate event — the timeline
      // represents transitions, not every write to the row.
      if (status !== expectedStatus) {
        await tx.applicationStatusEvent.create({
          data: { applicationId: id, status },
        });
      }
      return tx.application.findUnique({ where: { id } });
    });
  }

  // Same select shape as findApplicationWithJobOwner — this fresh read backs
  // both the ownership check and the CAS condition below, since a bulk
  // request has no per-item guard doing that read for it.
  findApplicationsForBulkUpdate(ids: string[]) {
    return this.prisma.application.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        status: true,
        talent: {
          select: {
            userId: true,
            user: { select: { name: true, email: true } },
          },
        },
        job: {
          select: {
            title: true,
            employerId: true,
          },
        },
      },
    });
  }

  // One conditional CAS UPDATE for the whole batch (via a VALUES list, same
  // pattern as JobsRepository.incrementViewCounts) instead of a per-item
  // updateMany — up to BULK_UPDATE_MAX_ITEMS (50) sequential round trips
  // inside one open transaction, previously. Each item still carries its
  // own expectedStatus (a mixed-status batch, e.g. rejecting some REVIEWING
  // and some SHORTLISTED applications together, is a real, reachable case —
  // the DTO's single `status` is only the target, not the precondition), so
  // this can't drop to a plain updateMany with one shared WHERE; the CAS
  // condition itself has to travel per-row through the VALUES list. A stale
  // row (status moved since the fresh read that produced `items`) simply
  // doesn't match `a.status = v.expected_status` and is silently excluded
  // from RETURNING — identical partial-success semantics to the old
  // per-item loop, not a behavior change. applicationStatusEvent rows are
  // now one batched createMany instead of one create per updated id.
  async bulkUpdateApplicationStatus(
    items: { id: string; expectedStatus: ApplicationStatus }[],
    status: ApplicationStatus,
    notes: string | undefined,
  ): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = Prisma.join(
        items.map(
          (item) =>
            Prisma.sql`(${item.id}, ${item.expectedStatus}::"ApplicationStatus")`,
        ),
      );
      // notes is applied to every row in the batch when present (see the
      // DTO's own comment: no per-item note in a bulk request) — conditional
      // at the SQL level, same as the old data: { status, ...(notes !==
      // undefined && { notes }) }, so an omitted notes leaves existing
      // values untouched rather than overwriting them with NULL.
      const updated = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "applications" AS a
        SET "status" = ${status}::"ApplicationStatus"
          ${notes !== undefined ? Prisma.sql`, "notes" = ${notes}` : Prisma.empty}
        FROM (VALUES ${rows}) AS v(id, expected_status)
        WHERE a.id = v.id AND a.status = v.expected_status
        RETURNING a.id
      `;
      const updatedIds = updated.map((row) => row.id);
      if (updatedIds.length > 0) {
        await tx.applicationStatusEvent.createMany({
          data: updatedIds.map((applicationId) => ({ applicationId, status })),
        });
      }
      return updatedIds;
    });
  }

  /** Self-contained narrow query (not a cross-import of UsersRepository) —
   * same reasoning as InvitationsRepository.employerMessagesEnabled. */
  async applicationUpdatesEnabled(userId: string): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: { applicationUpdates: true },
    });
    // No row yet (never opened Settings > Notifications) — the schema
    // default for applicationUpdates is true, so an absent row means "on".
    return pref?.applicationUpdates ?? true;
  }

  // Batch form of applicationUpdatesEnabled for bulkUpdateApplications — one
  // query for the whole batch instead of one per talent, since a batch can
  // touch up to BULK_UPDATE_MAX_ITEMS different talents at once.
  async findApplicationUpdatesPreferences(
    userIds: string[],
  ): Promise<Map<string, boolean>> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, applicationUpdates: true },
    });
    const byUserId = new Map(rows.map((r) => [r.userId, r.applicationUpdates]));
    // Same "no row yet -> default true" rule as the single-lookup version,
    // applied per id since userIds can include users with no preference row.
    return new Map(userIds.map((id) => [id, byUserId.get(id) ?? true]));
  }
}
