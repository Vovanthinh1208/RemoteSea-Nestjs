import { Injectable, Logger } from "@nestjs/common";
import { AdminRepository } from "./admin.repository";
import { EmployerService } from "@/modules/employer/employer.service";
import { JobsService } from "@/modules/jobs/jobs.service";
import { JobReportsService } from "@/modules/job-reports/job-reports.service";
import type { ListEmployersDto } from "./dto/list-employers.dto";
import type { UpdateEmployerDto } from "./dto/update-employer.dto";
import type { ListJobsDto } from "./dto/list-jobs.dto";
import type { ReviewJobDto } from "./dto/review-job.dto";
import type { ListJobReportsDto } from "@/modules/job-reports/dto/list-job-reports.dto";
import type { ResolveJobReportDto } from "@/modules/job-reports/dto/resolve-job-report.dto";
import type { RevenueSummary } from "./interfaces";
import {
  buildMonthlyRevenueBuckets,
  buildRecentMonthKeys,
  buildRevenuePlanMix,
  buildRevenueTransactions,
  computeRevenueTotals,
  monthKeyOf,
} from "./revenue.util";
import {
  BadRequestApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { PLAN_PRICES } from "@/common/constants/plan.constants";
import { EmailService } from "@/common/services/email.service";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import { runInBackground } from "@/common/utils/background-task.util";

const REVENUE_MONTHS_WINDOW = 8;
const RECENT_TRANSACTIONS_LIMIT = 10;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly employerService: EmployerService,
    private readonly jobsService: JobsService,
    private readonly jobReportsService: JobReportsService,
    private readonly emailService: EmailService,
  ) {}

  async listEmployers(query: ListEmployersDto) {
    const { verified, page, limit } = query;
    const skip = paginationSkip(page, limit);
    const where =
      verified === undefined ? {} : { isVerified: verified === "true" };

    const [employers, total] = await this.adminRepository.findEmployers(
      where,
      skip,
      limit,
    );

    const data = employers.map(({ jobs, ...rest }) => ({
      ...rest,
      jobCount: rest._count.jobs,
      totalSpend: jobs.reduce(
        (sum, j) => sum + (PLAN_PRICES[j.planType] ?? 0),
        0,
      ),
    }));

    return { employers: data, pagination: buildPagination(page, limit, total) };
  }

  async updateEmployer(
    id: string,
    dto: UpdateEmployerDto,
    adminId: string,
  ): Promise<{ success: true }> {
    const employer = await this.adminRepository.findEmployerById(id);
    if (!employer) {
      throw new NotFoundApiException(
        "Employer not found",
        ErrorCode.EMPLOYER_PROFILE_NOT_FOUND,
      );
    }

    if (dto.action === "verify") {
      await this.employerService.setVerified(id, true);
    } else {
      await this.employerService.suspend(id);
    }
    // No audit table for this today — logging the actor is the only record
    // of "who verified/suspended this employer" available during an
    // incident or dispute.
    const verb = dto.action === "verify" ? "verified" : "suspended";
    this.logger.log(`Employer ${id} ${verb} by admin ${adminId}`);

    return { success: true };
  }

  async listJobs(query: ListJobsDto) {
    const { status, page, limit } = query;
    const skip = paginationSkip(page, limit);
    const where = { status };

    const [jobs, total] = await this.adminRepository.findJobs(
      where,
      skip,
      limit,
    );

    return { jobs, pagination: buildPagination(page, limit, total) };
  }

  async reviewJob(id: string, dto: ReviewJobDto, adminId: string) {
    const job = await this.adminRepository.findJobWithEmployerEmail(id);
    if (!job) {
      throw new NotFoundApiException("Job not found", ErrorCode.JOB_NOT_FOUND);
    }
    if (job.status !== "PENDING_REVIEW") {
      throw new BadRequestApiException(
        `Job is ${job.status}, not pending review`,
        ErrorCode.JOB_NOT_PENDING_REVIEW,
      );
    }

    const { action, note } = dto;
    const employerEmail = job.employer.user.email;

    // The upfront status check above can go stale (another admin's review, or
    // an unrelated status change, landing between that read and this write) —
    // approveForReview/rejectForReview re-check PENDING_REVIEW atomically at
    // write time and return null if it no longer holds, so this can't
    // double-fire the approve/reject email + write the way a plain `update`
    // could.
    if (action === "approve") {
      const updated = await this.jobsService.approveForReview(id);
      if (!updated) {
        throw new BadRequestApiException(
          `Job is no longer pending review`,
          ErrorCode.JOB_NOT_PENDING_REVIEW,
        );
      }
      // No audit table for this today — logging the actor is the only record
      // of "who approved this job" available during an incident or dispute.
      this.logger.log(`Job ${id} approved by admin ${adminId}`);
      // The status change is already committed by the time we email below — a
      // notification failure must not surface as a failed review, since a retry
      // would then hit the PENDING_REVIEW guard above with no way to redo it.
      runInBackground(
        this.emailService.sendJobLiveEmail(employerEmail, job.title, job.slug),
        this.logger,
        `Failed to send job-live email for job ${id}`,
      );
      return updated;
    }

    const updated = await this.jobsService.rejectForReview(id, note ?? null);
    if (!updated) {
      throw new BadRequestApiException(
        `Job is no longer pending review`,
        ErrorCode.JOB_NOT_PENDING_REVIEW,
      );
    }
    this.logger.log(`Job ${id} rejected by admin ${adminId}`);
    runInBackground(
      this.emailService.sendJobRejectedEmail(
        employerEmail,
        job.title,
        note ?? "",
      ),
      this.logger,
      `Failed to send job-rejected email for job ${id}`,
    );
    return updated;
  }

  async getRevenue(): Promise<RevenueSummary> {
    const now = new Date();
    const monthKeys = buildRecentMonthKeys(REVENUE_MONTHS_WINDOW, now);
    const windowStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - (REVENUE_MONTHS_WINDOW - 1),
        1,
      ),
    );

    const [planCounts, recentPaidJobs, transactionJobs] = await Promise.all([
      this.adminRepository.countPaidJobsByPlan(),
      this.adminRepository.findPaidJobsSince(windowStart),
      this.adminRepository.findRecentPaidJobs(RECENT_TRANSACTIONS_LIMIT),
    ]);

    const months = buildMonthlyRevenueBuckets(recentPaidJobs, monthKeys);
    const mix = buildRevenuePlanMix(planCounts);
    const transactions = buildRevenueTransactions(transactionJobs);

    const currentMonthIndex = months.findIndex(
      (month) => month.key === monthKeyOf(now),
    );
    const totals = computeRevenueTotals(
      mix,
      months,
      currentMonthIndex === -1 ? months.length - 1 : currentMonthIndex,
    );

    return { months, mix, transactions, totals };
  }

  listReports(query: ListJobReportsDto) {
    return this.jobReportsService.listForAdmin(query);
  }

  resolveReport(id: string, dto: ResolveJobReportDto, adminId: string) {
    return this.jobReportsService.resolve(id, dto, adminId);
  }
}
