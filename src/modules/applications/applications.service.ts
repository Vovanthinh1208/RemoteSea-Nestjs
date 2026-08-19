import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import {
  ForbiddenApiException,
  ConflictApiException,
  BadRequestApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { EmailService } from "@/common/services/email.service";
import { isOwnedUploadUrl } from "@/modules/uploads/upload-url.util";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import { runInBackground } from "@/common/utils/background-task.util";
import { assertFound } from "@/common/utils/assert-found";
import type { Pagination } from "@/common/interfaces/pagination.interface";
import type { EnvConfig } from "@/core/config/env.validation";
import { ApplicationsRepository } from "./applications.repository";
import type { ApplyDto } from "./dto/apply.dto";
import type { ApplicationWithJob, OwnApplication } from "./interfaces";
import type { JobWithEmployerEmail } from "@/common/types/job-with-employer-email.type";
import {
  buildApplicationStatusCounts,
  groupBackloggedByEmployer,
  type ApplicationStatusCounts,
} from "./applications.util";
import { SEND_CONCURRENCY } from "./constants";

export type BacklogDispatchResult = { processed: number; sent: number };

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  // Same reasoning as AlertsService.dispatchInProgress — guards against two
  // overlapping runs on this instance re-querying/re-emailing the same
  // backlog; process-local only, not a cross-replica lock.
  private dispatchInProgress = false;

  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly emailService: EmailService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async findAllForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ applications: ApplicationWithJob[]; pagination: Pagination }> {
    const talent =
      await this.applicationsRepository.findTalentIdByUserId(userId);
    if (!talent) {
      return { applications: [], pagination: buildPagination(page, limit, 0) };
    }

    const skip = paginationSkip(page, limit);
    const [applications, total] =
      await this.applicationsRepository.findByTalentId(talent.id, skip, limit);
    return { applications, pagination: buildPagination(page, limit, total) };
  }

  /** DB-side status breakdown for TalentDashboard's stat tiles — see applications.util.ts. */
  async getStatusCounts(userId: string): Promise<ApplicationStatusCounts> {
    const talent =
      await this.applicationsRepository.findTalentIdByUserId(userId);
    if (!talent) return buildApplicationStatusCounts([]);

    const rows = await this.applicationsRepository.getStatusCountsByTalentId(
      talent.id,
    );
    return buildApplicationStatusCounts(rows);
  }

  async getAppliedJobIds(userId: string): Promise<string[]> {
    const talent =
      await this.applicationsRepository.findTalentIdByUserId(userId);
    if (!talent) return [];
    return this.applicationsRepository.findJobIdsByTalentId(talent.id);
  }

  // Backs the application-detail page a notification/activity-feed link now
  // points at (see EmployerService.updateApplication) — no talent profile,
  // or an id belonging to someone else's application, both 404 the same way.
  async getOwnApplication(
    userId: string,
    applicationId: string,
  ): Promise<ApplicationWithJob> {
    const talent =
      await this.applicationsRepository.findTalentIdByUserId(userId);
    if (!talent) {
      throw new NotFoundApiException(
        "Application not found",
        ErrorCode.APPLICATION_NOT_FOUND,
      );
    }
    const application = await this.applicationsRepository.findByIdForTalent(
      applicationId,
      talent.id,
    );
    assertFound(
      application,
      "Application not found",
      ErrorCode.APPLICATION_NOT_FOUND,
    );
    return application;
  }

  async apply(userId: string, dto: ApplyDto): Promise<OwnApplication> {
    const talent =
      await this.applicationsRepository.findTalentWithUserName(userId);
    if (!talent) {
      throw new ForbiddenApiException(
        "Talent profile required",
        ErrorCode.TALENT_PROFILE_REQUIRED,
      );
    }

    const existing = await this.applicationsRepository.findByJobAndTalent(
      dto.jobId,
      talent.id,
    );
    if (existing) {
      throw new ConflictApiException(
        "Already applied",
        ErrorCode.ALREADY_APPLIED,
      );
    }

    // resumeUrl was only checked with z.string().url() — any URL passed the DTO,
    // completely bypassing the presign flow's content-type allowlist, size cap,
    // and rate limit. Only accept a URL this user could actually have obtained
    // from their own POST /uploads/presign call.
    if (
      dto.resumeUrl &&
      !isOwnedUploadUrl(
        dto.resumeUrl,
        this.config.get("CDN_URL", { infer: true }),
        userId,
        "resume",
      )
    ) {
      throw new BadRequestApiException(
        "resumeUrl must be an uploaded file from this account",
        ErrorCode.UPLOAD_URL_NOT_OWNED,
      );
    }

    let result: { application: OwnApplication; job: JobWithEmployerEmail };
    try {
      result = await this.applicationsRepository.createAndIncrementApplyCount({
        jobId: dto.jobId,
        talentId: talent.id,
        coverLetter: dto.coverLetter,
        resumeUrl: dto.resumeUrl,
      });
    } catch (error) {
      // The findByJobAndTalent check above is only a fast path — a concurrent
      // duplicate apply (double-click, retried request) can still race past
      // it and hit the applications_jobId_talentId_key unique constraint.
      // Without this, that race surfaces as GlobalExceptionFilter's generic
      // P2002 -> ErrorCode.CONFLICT instead of the same ALREADY_APPLIED the
      // fast path above already promises callers for this exact condition.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictApiException(
          "Already applied",
          ErrorCode.ALREADY_APPLIED,
        );
      }
      throw error;
    }
    const { application, job } = result;

    // The application is already committed above — a notification-email failure
    // must not turn a successful apply into a 500 (a retry would then wrongly
    // hit "Already applied"). Sent in the background: the failure was already
    // swallowed-and-logged before, so awaiting it only made the applicant wait
    // out a full outbound HTTP round-trip for nothing.
    runInBackground(
      this.emailService.sendApplicationReceivedEmail(
        job.employer.user.email,
        job.title,
        talent.user.name ?? "A candidate",
      ),
      this.logger,
      `Failed to send application-received email for application ${application.id}`,
    );

    return application;
  }

  /** Employer Response SLA — GET /applications/cron/reminders (external
   * scheduler, CronSecretGuard). Mirrors AlertsService.dispatchCron's shape:
   * re-entrancy guard, bounded-concurrency sends, unconditional summary log. */
  async dispatchBacklogReminders(): Promise<BacklogDispatchResult> {
    if (this.dispatchInProgress) {
      this.logger.warn(
        "Skipped dispatchBacklogReminders: a previous run on this instance is still in progress.",
      );
      return { processed: 0, sent: 0 };
    }

    this.dispatchInProgress = true;
    const start = Date.now();
    try {
      const backlogged = await this.applicationsRepository.findBacklogged();
      const groups = groupBackloggedByEmployer(backlogged, new Date());

      let sent = 0;
      for (let i = 0; i < groups.length; i += SEND_CONCURRENCY) {
        const chunk = groups.slice(i, i + SEND_CONCURRENCY);
        await Promise.all(
          chunk.map(async (group) => {
            try {
              await this.emailService.sendBacklogReminderEmail(
                group.email,
                group.items,
              );
              await this.applicationsRepository.markRemindersSent(
                group.applicationIds,
              );
              sent += 1;
            } catch (error) {
              this.logger.error(
                `Failed to send backlog reminder to employer ${group.employerId}`,
                error instanceof Error ? error.stack : error,
              );
            }
          }),
        );
      }

      this.logger.log(
        `dispatchBacklogReminders finished: processed ${backlogged.length} application(s) across ${groups.length} employer(s), sent ${sent} email(s) in ${Date.now() - start}ms`,
      );
      return { processed: backlogged.length, sent };
    } finally {
      this.dispatchInProgress = false;
    }
  }
}
