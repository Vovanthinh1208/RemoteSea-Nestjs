import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CACHE_MANAGER, type Cache } from "@nestjs/cache-manager";
import {
  Prisma,
  type ApplicationStatus,
  type CompanyMemberRole,
} from "@prisma/client";
import * as crypto from "crypto";
import {
  EmployerRepository,
  type ProfileWithJobCount,
  type PublicEmployerProfile,
} from "./employer.repository";
import {
  ALLOWED_TRANSITIONS,
  APPLICATION_STATUS_LABELS,
  BULK_SKIPPED_STATUSES,
  VERIFICATION_OTP_LENGTH,
  VERIFICATION_OTP_MAX_ATTEMPTS,
  VERIFICATION_OTP_TTL_MS,
} from "./constants";
import type { CreateEmployerProfileDto } from "./dto/create-employer-profile.dto";
import type { UpdateEmployerProfileDto } from "./dto/update-employer-profile.dto";
import type { ListEmployerJobsDto } from "./dto/list-employer-jobs.dto";
import type { ListJobApplicationsDto } from "./dto/list-job-applications.dto";
import type { UpdateApplicationDto } from "./dto/update-application.dto";
import type { BulkUpdateApplicationsDto } from "./dto/bulk-update-applications.dto";
import type { SubmitVerificationDto } from "./dto/submit-verification.dto";
import type { ConfirmVerificationDto } from "./dto/confirm-verification.dto";
import type { VerifyCodeDto } from "./dto/verify-code.dto";
import {
  OTP_TOKEN_PREFIX,
  domainMatches,
  hashVerificationCode,
} from "./verification.util";
import { buildApplicantsCsv } from "./applicant-csv.util";
import { slugify, withUniqueSuffix } from "@/common/utils/slugify";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import { assertFound } from "@/common/utils/assert-found";
import { isOwnedUploadUrl } from "@/modules/uploads/upload-url.util";
import { UploadsService } from "@/modules/uploads/uploads.service";
import type { EnvConfig } from "@/core/config/env.validation";
import { EmailService } from "@/common/services/email.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { MessagesService } from "@/modules/messages/messages.service";
import type { SendMessageDto } from "@/modules/messages/dto/send-message.dto";
import { InterviewsService } from "@/modules/interviews/interviews.service";
import type { CancelInterviewDto } from "@/modules/interviews/dto/cancel-interview.dto";
import type { ProposeInterviewDto } from "@/modules/interviews/dto/propose-interview.dto";
import { ScorecardsService } from "@/modules/scorecards/scorecards.service";
import { CommentsService } from "@/modules/comments/comments.service";
import type { CreateCommentDto } from "@/modules/comments/dto/create-comment.dto";
import type { CreateScorecardDto } from "@/modules/scorecards/dto/create-scorecard.dto";
import { CvAnalysisService } from "@/modules/cv-analysis/cv-analysis.service";
import { runInBackground } from "@/common/utils/background-task.util";
import { getOrSetCache } from "@/common/caching/cache.util";
import {
  BadRequestApiException,
  ConflictApiException,
} from "@/common/exceptions/api.exception";
import { nullOnExpectedError } from "@/common/utils/null-on-expected-error.util";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { ApplicationWithJobOwner } from "./guards/application-ownership.guard";
import { CompanyMembershipService } from "@/modules/company/company-membership.service";
import type { CompanyMembership } from "@/modules/company/company-membership.interfaces";
import {
  ALL_COMPANY_ROLES,
  APPLICATION_REVIEW_ROLES,
  OWNER_ONLY,
  requireCompanyRole,
} from "@/common/authorization/company-role.util";
import { buildHiringFunnel } from "./funnel.util";

// Below this many responded applications, a public "responds within ~Xh"
// figure is more noise than signal (and trivially gameable by an employer
// with 1-2 fast responses) — the stat simply doesn't render rather than
// showing a misleadingly precise number.
const MIN_RESPONDED_APPLICATIONS_FOR_PUBLIC_STAT = 3;
const PUBLIC_RESPONSE_STATS_CACHE_TTL_MS = 300_000;
// High enough that no single job's applicant pool realistically exceeds it
// — a CSV export has no real pagination UX, so this is a safety cap, not a
// page size.
const APPLICANTS_CSV_EXPORT_CAP = 5000;

@Injectable()
export class EmployerService {
  private readonly logger = new Logger(EmployerService.name);

  constructor(
    private readonly employerRepository: EmployerRepository,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly uploadsService: UploadsService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly messagesService: MessagesService,
    private readonly interviewsService: InterviewsService,
    private readonly scorecardsService: ScorecardsService,
    private readonly commentsService: CommentsService,
    private readonly cvAnalysisService: CvAnalysisService,
    private readonly companyMembershipService: CompanyMembershipService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private async requireRole(
    userId: string,
    allowed: readonly CompanyMemberRole[],
  ): Promise<CompanyMembership> {
    const membership =
      await this.companyMembershipService.resolveMembership(userId);
    return requireCompanyRole(membership, allowed);
  }

  async createProfile(
    userId: string,
    dto: CreateEmployerProfileDto,
  ): Promise<{ id: string; slug: string; companyName: string }> {
    const existing = await this.employerRepository.findProfileByUserId(userId);
    if (existing) {
      throw new ConflictApiException(
        "Employer profile already exists",
        ErrorCode.EMPLOYER_PROFILE_ALREADY_EXISTS,
      );
    }
    // A User caps at one company (CompanyMember.userId is @unique) — someone
    // who joined another company via a team invite can't also start their
    // own here.
    const existingMembership =
      await this.companyMembershipService.resolveMembership(userId);
    if (existingMembership) {
      throw new ConflictApiException(
        "You already belong to a company",
        ErrorCode.ALREADY_COMPANY_MEMBER,
      );
    }

    // A company name made entirely of characters slugify can't transliterate
    // (e.g. CJK, or Vietnamese with no plain-Latin fallback) reduces to an empty
    // base — previously the *first* such employer got that empty string written
    // straight to the DB as their slug, breaking their public profile URL.
    const base = slugify(dto.companyName);
    const taken = base
      ? await this.employerRepository.findProfileBySlug(base)
      : true;
    const slug = taken ? withUniqueSuffix(base || "company") : base;

    try {
      return await this.employerRepository.createProfileForUser(
        userId,
        dto,
        slug,
      );
    } catch (error) {
      // Two concurrent signups for the same company name can both pass the
      // findProfileBySlug check above before either writes — retry once with a
      // guaranteed-unique slug instead of surfacing a raw conflict to the loser.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return this.employerRepository.createProfileForUser(
          userId,
          dto,
          withUniqueSuffix(base || "company"),
        );
      }
      throw error;
    }
  }

  // Any active company role can view — only updateProfile/verification are
  // OWNER-gated (see requireRole calls below). Deliberately doesn't reuse
  // requireRole here (that throws 403) — the frontend's useEmployerProfile
  // hook distinguishes "no profile yet, show the create form" from a real
  // error by checking for exactly a 404, so "no membership" has to keep
  // surfacing as EMPLOYER_PROFILE_NOT_FOUND/404, same as before multi-seat
  // existed.
  async getProfile(
    userId: string,
  ): Promise<ProfileWithJobCount & { totalApplications: number }> {
    const membership =
      await this.companyMembershipService.resolveMembership(userId);
    assertFound(
      membership,
      "Profile not found",
      ErrorCode.EMPLOYER_PROFILE_NOT_FOUND,
    );
    const [profile, totalApplications] = await Promise.all([
      this.employerRepository.findProfileWithJobCount(membership.employerId),
      this.employerRepository.countApplicationsForOwner(membership.employerId),
    ]);
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.EMPLOYER_PROFILE_NOT_FOUND,
    );

    return { ...profile, totalApplications };
  }

  // Unauthenticated (GET /companies/:slug) — no visibility gate like talent's
  // VERIFIED_EMPLOYERS, since there's no equivalent privacy concept on
  // EmployerProfile: every company that exists is fine to show publicly.
  async getPublicCompanyProfile(slug: string) {
    const profile = await this.employerRepository.findPublicProfileBySlug(slug);
    assertFound(
      profile,
      "Company not found",
      ErrorCode.EMPLOYER_PROFILE_NOT_FOUND,
    );

    const [stats, jobs, avgFirstResponseHours] = await Promise.all([
      this.employerRepository.getPublicCompanyStats(profile.id),
      this.employerRepository.findActiveJobsForCompany(profile.id),
      this.getPublicResponseHours(profile.id),
    ]);

    return { ...profile, ...stats, avgFirstResponseHours, jobs };
  }

  // OWNER only — editing the company's own identity (name, logo, etc.) is
  // "manage company", not "manage jobs/applications" that RECRUITER/
  // HIRING_MANAGER get.
  async updateProfile(
    userId: string,
    dto: UpdateEmployerProfileDto,
  ): Promise<PublicEmployerProfile> {
    const membership = await this.requireRole(userId, OWNER_ONLY);
    const profile = await this.employerRepository.findProfileByCompanyId(
      membership.employerId,
    );
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.EMPLOYER_PROFILE_NOT_FOUND,
    );

    // logoUrl was only checked with z.string().url() — any URL passed the DTO,
    // completely bypassing the presign flow's content-type allowlist, size cap,
    // and rate limit. Only accept a URL this user could actually have obtained
    // from their own POST /uploads/presign call.
    if (
      dto.logoUrl &&
      !isOwnedUploadUrl(
        dto.logoUrl,
        this.config.get("CDN_URL", { infer: true }),
        userId,
        "logo",
      )
    ) {
      throw new BadRequestApiException(
        "logoUrl must be an uploaded file from this account",
        ErrorCode.UPLOAD_URL_NOT_OWNED,
      );
    }

    // Same ownership rule for the PB31 cover image as for the logo above.
    if (
      dto.coverImageUrl &&
      !isOwnedUploadUrl(
        dto.coverImageUrl,
        this.config.get("CDN_URL", { infer: true }),
        userId,
        "cover",
      )
    ) {
      throw new BadRequestApiException(
        "coverImageUrl must be an uploaded file from this account",
        ErrorCode.UPLOAD_URL_NOT_OWNED,
      );
    }

    const updated = await this.employerRepository.updateProfile(
      profile.id,
      dto,
    );

    // Best-effort — a previous logo being replaced would otherwise sit orphaned
    // in the bucket forever, since nothing else in the app ever cleans it up.
    // Bare void (not runInBackground) is safe only because deleteObjectByUrl
    // catches and logs its own failures internally, so this promise never
    // rejects — if that internal handling is ever removed, this becomes an
    // unhandled rejection and should switch to runInBackground.
    if (dto.logoUrl && profile.logoUrl && profile.logoUrl !== dto.logoUrl) {
      void this.uploadsService.deleteObjectByUrl(profile.logoUrl);
    }
    if (
      dto.coverImageUrl !== undefined &&
      profile.coverImageUrl &&
      profile.coverImageUrl !== dto.coverImageUrl
    ) {
      void this.uploadsService.deleteObjectByUrl(profile.coverImageUrl);
    }

    return updated;
  }

  // Admin-triggered (AdminService.verifyEmployer/suspendEmployer), not
  // self-service — but the write itself belongs here, not reimplemented in
  // AdminRepository, since this module owns the EmployerProfile domain.
  setVerified(id: string, isVerified: boolean) {
    return this.employerRepository.setVerified(id, isVerified);
  }

  suspend(id: string): Promise<void> {
    return this.employerRepository.suspend(id);
  }

  // Called by JobsService when rendering a public job detail page (see
  // jobs.module.ts's import of EmployerModule) — cached per-employer since
  // it's a live two-table aggregate and the job-detail route itself has no
  // HTTP cache layer (it increments viewCount per request). Returns null
  // below the sample-size floor, same "just don't show it" handling a job
  // with no salary gets rather than a misleading number.
  async getPublicResponseHours(employerId: string): Promise<number | null> {
    const { avgHours, respondedCount } = await getOrSetCache(
      this.cache,
      `employer:${employerId}:public-response-stats`,
      PUBLIC_RESPONSE_STATS_CACHE_TTL_MS,
      () => this.employerRepository.getPublicResponseStats(employerId),
    );
    if (respondedCount < MIN_RESPONDED_APPLICATIONS_FOR_PUBLIC_STAT) {
      return null;
    }
    return avgHours;
  }

  // OWNER only — verifying the company's identity is an ownership-tier action.
  async submitVerification(
    userId: string,
    dto: SubmitVerificationDto,
  ): Promise<void> {
    const membership = await this.requireRole(userId, OWNER_ONLY);
    const profile = await this.employerRepository.findProfileForVerification(
      membership.employerId,
    );
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.EMPLOYER_PROFILE_NOT_FOUND,
    );

    if (!profile.websiteUrl) {
      throw new BadRequestApiException(
        "Add a company website before verifying",
        ErrorCode.EMPLOYER_WEBSITE_REQUIRED,
      );
    }

    if (!domainMatches(profile.websiteUrl, dto.email)) {
      throw new BadRequestApiException(
        "Email domain must match your company website",
        ErrorCode.EMPLOYER_VERIFICATION_DOMAIN_MISMATCH,
      );
    }

    // PB32 AC3: a 6-digit OTP. Only its hash is stored (scoped to this
    // company, which also keeps the column's unique index collision-free
    // across companies that happen to draw the same code).
    const code = crypto
      .randomInt(0, 10 ** VERIFICATION_OTP_LENGTH)
      .toString()
      .padStart(VERIFICATION_OTP_LENGTH, "0");
    await this.employerRepository.createEmailVerification(
      profile.id,
      dto.email,
      hashVerificationCode(profile.id, code),
      new Date(Date.now() + VERIFICATION_OTP_TTL_MS),
    );

    runInBackground(
      this.emailService.sendEmployerVerificationEmail(
        dto.email,
        profile.companyName,
        code,
      ),
      this.logger,
      `Failed to send verification email for employer ${profile.id}`,
    );
  }

  // PB32 AC4–5: the OWNER enters the emailed code within 15 minutes; a match
  // marks the company VERIFIED and grants the badge.
  async verifyCode(userId: string, dto: VerifyCodeDto): Promise<void> {
    const membership = await this.requireRole(userId, OWNER_ONLY);
    const employerId = membership.employerId;
    const record =
      await this.employerRepository.findPendingEmailVerification(employerId);
    if (!record) {
      throw new BadRequestApiException(
        "No active verification code — request a new one",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    if (
      record.expiresAt < new Date() ||
      record.attempts >= VERIFICATION_OTP_MAX_ATTEMPTS
    ) {
      await this.employerRepository.burnEmailVerification(
        record.id,
        employerId,
      );
      throw new BadRequestApiException(
        "This code has expired — request a new one",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    const expected = Buffer.from(record.token);
    const actual = Buffer.from(hashVerificationCode(employerId, dto.code));
    if (
      expected.length !== actual.length ||
      !crypto.timingSafeEqual(expected, actual)
    ) {
      const attempts =
        await this.employerRepository.recordFailedVerificationAttempt(
          record.id,
        );
      if (attempts >= VERIFICATION_OTP_MAX_ATTEMPTS) {
        await this.employerRepository.burnEmailVerification(
          record.id,
          employerId,
        );
        throw new BadRequestApiException(
          "Too many wrong codes — request a new one",
          ErrorCode.INVALID_OR_EXPIRED_TOKEN,
        );
      }
      throw new BadRequestApiException(
        "Incorrect verification code",
        ErrorCode.INVALID_VERIFICATION_CODE,
      );
    }

    const confirmed = await this.employerRepository.consumeEmailVerification(
      record.id,
      employerId,
    );
    if (!confirmed) {
      throw new BadRequestApiException(
        "Invalid or expired code",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }
  }

  // Legacy link confirmation for verification emails sent before PB32's OTP
  // flow (64-hex link tokens, 24h). New codes are stored hashed, so no link
  // can confirm them; this route can be removed once those links lapse.
  async confirmVerification(dto: ConfirmVerificationDto): Promise<void> {
    // An OTP row is only ever confirmed through verifyCode.
    const record = dto.token.startsWith(OTP_TOKEN_PREFIX)
      ? null
      : await this.employerRepository.findEmailVerificationByToken(dto.token);
    if (!record || record.consumedAt) {
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    if (record.expiresAt < new Date()) {
      await this.employerRepository.markVerificationFailed(record.employerId);
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    const confirmed = await this.employerRepository.consumeEmailVerification(
      record.id,
      record.employerId,
    );
    if (!confirmed) {
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }
  }

  // INTERVIEWER excluded — browsing every job on the company's board is
  // broader than "assigned interviews/candidates".
  async listJobs(userId: string, dto: ListEmployerJobsDto) {
    const membership = await this.requireRole(userId, APPLICATION_REVIEW_ROLES);

    const [
      jobs,
      { totalApps, shortlisted, avgTimeToHireInDays, avgFirstResponseHours },
    ] = await Promise.all([
      this.employerRepository.findJobsByEmployer(
        membership.employerId,
        dto.status,
      ),
      this.employerRepository.getEmployerJobStats(membership.employerId),
    ]);

    return {
      jobs,
      stats: {
        totalApps,
        shortlisted,
        avgTimeToHireInDays,
        avgFirstResponseHours,
      },
    };
  }

  async listJobApplications(jobId: string, dto: ListJobApplicationsDto) {
    // Ownership is already enforced by EmployerJobOwnershipGuard before this runs.
    const { status, q, page, limit } = dto;
    const skip = paginationSkip(page, limit);
    const { applications, total } =
      await this.employerRepository.findApplicationsForJob(
        jobId,
        { status, q },
        skip,
        limit,
      );

    return {
      applications,
      pagination: buildPagination(page, limit, total),
    };
  }

  // CSV export for one job — the same select and status filter
  // listJobApplications already uses (findApplicationsForJob), just
  // unpaginated: it exports every applicant matching that filter, up to a
  // cap high enough that "paginated" never matters in practice for a single
  // job's applicant pool.
  async exportJobApplicantsCsv(
    jobId: string,
    status?: ApplicationStatus,
  ): Promise<string> {
    const { applications } =
      await this.employerRepository.findApplicationsForJob(
        jobId,
        { status },
        0,
        APPLICANTS_CSV_EXPORT_CAP,
      );
    const frontendUrl = this.config.get("FRONTEND_URL", { infer: true });
    return buildApplicantsCsv(applications, frontendUrl);
  }

  // Backs the dashboard's "Recent applicants" panel — replaces what used to
  // be one listJobApplications() call per job (fired client-side via
  // useQueries) with the single company-wide query this delegates to. Same
  // role gate as listJobs/listUpcomingInterviews (company-wide, no
  // per-resource ownership guard needed since it's already scoped by the
  // caller's own membership.employerId).
  async getRecentApplications(userId: string) {
    const membership = await this.requireRole(userId, APPLICATION_REVIEW_ROLES);
    const applications =
      await this.employerRepository.findRecentApplicationsForCompany(
        membership.employerId,
      );
    return { applications };
  }

  // Hiring funnel dashboard chart: aggregates every ApplicationStatusEvent
  // across this employer's jobs into pipeline-stage counts + conversion
  // rates (see funnel.util.ts). Same role gate as the applications list
  // this is derived from — anyone who can review applications can see the
  // funnel built from them.
  async getHiringFunnel(userId: string) {
    const membership = await this.requireRole(userId, APPLICATION_REVIEW_ROLES);
    const counts = await this.employerRepository.getApplicationFunnelCounts(
      membership.employerId,
    );
    return buildHiringFunnel(counts);
  }

  // Backs GET /employer/dashboard — one round trip for the whole dashboard
  // screen instead of the frontend firing getProfile/listJobs/
  // getRecentApplications/getHiringFunnel as four separate requests (each
  // independently 403/404-ing the same "no company yet" way, which the
  // frontend used to catch four times over). Reuses those exact methods
  // rather than re-deriving their authorization/query logic here, so this
  // can never silently drift from what each already does on its own —
  // still four independent DB round trips under the hood (they don't share
  // one membership lookup), just run concurrently and returned as one HTTP
  // response instead of four.
  async getDashboard(userId: string) {
    const [profile, jobs, recentApplications, funnel] = await Promise.all([
      this.getProfile(userId).catch(nullOnExpectedError),
      this.listJobs(userId, {}).catch(nullOnExpectedError),
      this.getRecentApplications(userId).catch(nullOnExpectedError),
      this.getHiringFunnel(userId).catch(nullOnExpectedError),
    ]);
    return { profile, jobs, recentApplications, funnel };
  }

  async updateApplication(
    application: ApplicationWithJobOwner,
    dto: UpdateApplicationDto,
  ) {
    // Ownership is already enforced by ApplicationOwnershipGuard before this runs.
    const { status, notes, reason, offer } = dto;
    const isTransition = status !== application.status;
    if (
      isTransition &&
      !ALLOWED_TRANSITIONS[application.status].includes(status)
    ) {
      throw new BadRequestApiException(
        `Cannot transition from ${application.status} to ${status}`,
        ErrorCode.INVALID_STATUS_TRANSITION,
      );
    }

    // PB56 AC1–2: an offer always reaches the talent with its details.
    if (isTransition && status === "OFFERED" && !offer) {
      throw new BadRequestApiException(
        "Salary, benefits and start date are required to extend an offer",
        ErrorCode.OFFER_DETAILS_REQUIRED,
      );
    }
    if (offer && status !== "OFFERED") {
      throw new BadRequestApiException(
        "Offer details can only be sent with status OFFERED",
        ErrorCode.VALIDATION_ERROR,
      );
    }
    if (reason !== undefined && status !== "REJECTED") {
      throw new BadRequestApiException(
        "A reason can only be sent with status REJECTED",
        ErrorCode.VALIDATION_ERROR,
      );
    }
    const offerStartDate = offer
      ? new Date(`${offer.startDate}T00:00:00Z`)
      : undefined;
    if (offerStartDate) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (offerStartDate < today) {
        throw new BadRequestApiException(
          "The proposed start date can't be in the past",
          ErrorCode.VALIDATION_ERROR,
        );
      }
    }

    const updated = await this.employerRepository.updateApplication(
      application.id,
      application.status,
      status,
      notes,
      {
        ...(reason !== undefined && { rejectionReason: reason }),
        ...(offer && {
          offerSalary: offer.salary,
          offerBenefits: offer.benefits,
          offerStartDate,
        }),
      },
    );
    if (!updated) {
      throw new ConflictApiException(
        "Application was updated concurrently — please refresh and try again",
        ErrorCode.APPLICATION_UPDATE_CONFLICT,
      );
    }

    // Only a real transition is notification-worthy — a notes-only save
    // (status === application.status) already skips the audit-log event for
    // the same reason, see EmployerRepository.updateApplication's comment.
    if (isTransition) {
      const detail =
        status === "REJECTED" && reason
          ? ` Feedback: ${reason}`
          : status === "OFFERED"
            ? " Open the application to review the offer details."
            : "";
      runInBackground(
        this.notificationsService.create({
          userId: application.talent.userId,
          type: "APPLICATION_STATUS_CHANGED",
          title: "Your application status changed",
          body: `Your application for ${application.job.title} is now ${APPLICATION_STATUS_LABELS[status]}.${detail}`,
          link: `/applications/${application.id}`,
        }),
        this.logger,
        `Failed to create application-status notification for application ${application.id}`,
      );

      // In-app notification above is unconditional (an always-on channel,
      // same as everywhere else in this codebase) — only the email is
      // gated, same split InvitationsService already uses for
      // employerMessages.
      const emailEnabled =
        await this.employerRepository.applicationUpdatesEnabled(
          application.talent.userId,
        );
      if (emailEnabled) {
        runInBackground(
          this.emailService.sendApplicationStatusChangedEmail(
            application.talent.user.email,
            application.talent.user.name ?? "there",
            application.job.title,
            APPLICATION_STATUS_LABELS[status],
            status === "REJECTED" ? reason : undefined,
          ),
          this.logger,
          `Failed to send application-status email for application ${application.id}`,
        );
      }
    }

    return updated;
  }

  async bulkUpdateApplications(
    callerId: string,
    dto: BulkUpdateApplicationsDto,
  ): Promise<{
    updated: string[];
    skipped: string[];
    failed: {
      id: string;
      reason: "NOT_FOUND" | "INVALID_TRANSITION" | "STALE";
    }[];
  }> {
    // PB56: each offer carries its own salary/benefits/start date, which a
    // single shared bulk payload can't express — offers go one at a time.
    if (dto.status === "OFFERED") {
      throw new BadRequestApiException(
        "Offers must be sent individually with their details",
        ErrorCode.OFFER_DETAILS_REQUIRED,
      );
    }
    if (dto.reason !== undefined && dto.status !== "REJECTED") {
      throw new BadRequestApiException(
        "A reason can only be sent with status REJECTED",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // No single :id for a guard to load (see EmployerJobOwnershipGuard's
    // comment) — company + role are resolved once here instead, then
    // checked per item below, same shape as the guard-based routes.
    const membership = await this.requireRole(
      callerId,
      APPLICATION_REVIEW_ROLES,
    );

    const found = await this.employerRepository.findApplicationsForBulkUpdate(
      dto.ids,
    );
    const byId = new Map(found.map((a) => [a.id, a]));

    const failed: {
      id: string;
      reason: "NOT_FOUND" | "INVALID_TRANSITION" | "STALE";
    }[] = [];
    const skipped: string[] = [];
    const validItems: {
      id: string;
      expectedStatus: ApplicationStatus;
      talentUserId: string;
      talentEmail: string;
      talentName: string | null;
      jobTitle: string;
    }[] = [];

    for (const id of dto.ids) {
      const application = byId.get(id);
      // Not found and not-owned (or owned by a *different* company than the
      // caller's) collapse to the same NOT_FOUND reason — same "don't
      // confirm another company's application exists" logic as
      // notFoundOnMismatch elsewhere.
      if (
        !application ||
        application.job.employerId !== membership.employerId
      ) {
        failed.push({ id, reason: "NOT_FOUND" });
        continue;
      }
      if (BULK_SKIPPED_STATUSES.has(application.status)) {
        skipped.push(id);
        continue;
      }
      if (!ALLOWED_TRANSITIONS[application.status].includes(dto.status)) {
        failed.push({ id, reason: "INVALID_TRANSITION" });
        continue;
      }
      validItems.push({
        id,
        expectedStatus: application.status,
        talentUserId: application.talent.userId,
        talentEmail: application.talent.user.email,
        talentName: application.talent.user.name,
        jobTitle: application.job.title,
      });
    }

    const updatedIds =
      await this.employerRepository.bulkUpdateApplicationStatus(
        validItems.map(({ id, expectedStatus }) => ({ id, expectedStatus })),
        dto.status,
        dto.notes,
        dto.reason,
      );
    const updatedSet = new Set(updatedIds);

    // One query for every talent in the batch instead of one per item (see
    // EmployerRepository.findApplicationUpdatesPreferences) — only the
    // email send is gated, same as the single-item path above.
    const emailPrefs =
      await this.employerRepository.findApplicationUpdatesPreferences(
        validItems.map((item) => item.talentUserId),
      );

    for (const item of validItems) {
      if (!updatedSet.has(item.id)) {
        // Lost the CAS race between the fresh read above and the
        // transactional write — someone else (most likely the talent,
        // withdrawing) changed this row in between.
        failed.push({ id: item.id, reason: "STALE" });
        continue;
      }
      runInBackground(
        this.notificationsService.create({
          userId: item.talentUserId,
          type: "APPLICATION_STATUS_CHANGED",
          title: "Your application status changed",
          body: `Your application for ${item.jobTitle} is now ${APPLICATION_STATUS_LABELS[dto.status]}.${dto.reason ? ` Feedback: ${dto.reason}` : ""}`,
          link: `/applications/${item.id}`,
        }),
        this.logger,
        `Failed to create application-status notification for application ${item.id}`,
      );

      if (emailPrefs.get(item.talentUserId) ?? true) {
        runInBackground(
          this.emailService.sendApplicationStatusChangedEmail(
            item.talentEmail,
            item.talentName ?? "there",
            item.jobTitle,
            APPLICATION_STATUS_LABELS[dto.status],
            dto.reason,
          ),
          this.logger,
          `Failed to send application-status email for application ${item.id}`,
        );
      }
    }

    return { updated: updatedIds, skipped, failed };
  }

  listApplicationMessages(application: ApplicationWithJobOwner) {
    return this.messagesService.list(application);
  }

  sendApplicationMessage(
    application: ApplicationWithJobOwner,
    userId: string,
    dto: SendMessageDto,
  ) {
    return this.messagesService.send(application, userId, dto);
  }

  getApplicationInterview(application: ApplicationWithJobOwner) {
    return this.interviewsService.get(application);
  }

  getApplicationInterviewIcs(application: ApplicationWithJobOwner) {
    return this.interviewsService.getIcsFile(application);
  }

  // Company-wide, not per-application — open to any seat (ALL_COMPANY_ROLES),
  // unlike the per-application interview routes above, which are gated by
  // ApplicationOwnershipGuard/ApplicationAccessGuard on APPLICATION_REVIEW_ROLES
  // (+ assignment). Pure pass-through otherwise — the role-based "mine vs
  // team" decision belongs to and is made entirely inside
  // InterviewsService.listUpcomingForCompany, not duplicated here.
  async listUpcomingInterviews(userId: string) {
    const membership = await this.requireRole(userId, ALL_COMPANY_ROLES);
    return this.interviewsService.listUpcomingForCompany(
      membership.employerId,
      membership.role,
      userId,
    );
  }

  proposeInterview(
    application: ApplicationWithJobOwner,
    dto: ProposeInterviewDto,
  ) {
    return this.interviewsService.propose(application, dto);
  }

  cancelInterview(
    application: ApplicationWithJobOwner,
    dto: CancelInterviewDto,
  ) {
    return this.interviewsService.cancel(application, dto);
  }

  listApplicationScorecards(application: ApplicationWithJobOwner) {
    return this.scorecardsService.list(application.id);
  }

  getApplicationCvAnalysis(application: ApplicationWithJobOwner) {
    return this.cvAnalysisService.getOrCreate(application.id);
  }

  regenerateApplicationCvAnalysis(application: ApplicationWithJobOwner) {
    return this.cvAnalysisService.regenerate(application.id);
  }

  submitApplicationScorecard(
    application: ApplicationWithJobOwner,
    authorId: string,
    dto: CreateScorecardDto,
  ) {
    return this.scorecardsService.create(application.id, authorId, dto);
  }

  listApplicationComments(application: ApplicationWithJobOwner) {
    return this.commentsService.list(application.id);
  }

  addApplicationComment(
    application: ApplicationWithJobOwner,
    authorId: string,
    dto: CreateCommentDto,
  ) {
    return this.commentsService.create(application.id, authorId, dto);
  }
}
