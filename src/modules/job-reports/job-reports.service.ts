import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { JobReportsRepository } from "./job-reports.repository";
import type { CreateJobReportDto } from "./dto/create-job-report.dto";
import type { ListJobReportsDto } from "./dto/list-job-reports.dto";
import type { ResolveJobReportDto } from "./dto/resolve-job-report.dto";
import {
  BadRequestApiException,
  ConflictApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { assertFound } from "@/common/utils/assert-found";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import { runInBackground } from "@/common/utils/background-task.util";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

@Injectable()
export class JobReportsService {
  private readonly logger = new Logger(JobReportsService.name);

  constructor(
    private readonly jobReportsRepository: JobReportsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    user: AuthenticatedUser,
    jobId: string,
    dto: CreateJobReportDto,
  ) {
    const job = await this.jobReportsRepository.findJobForReport(jobId);
    assertFound(job, "Job not found", ErrorCode.JOB_NOT_FOUND);

    const existing = await this.jobReportsRepository.findOpenByJobAndReporter(
      jobId,
      user.id,
    );
    if (existing) {
      throw new ConflictApiException(
        "You've already reported this job",
        ErrorCode.JOB_ALREADY_REPORTED,
      );
    }

    try {
      return await this.jobReportsRepository.create({
        jobId,
        reporterId: user.id,
        reason: dto.reason,
        details: dto.details ?? null,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictApiException(
          "You've already reported this job",
          ErrorCode.JOB_ALREADY_REPORTED,
        );
      }
      throw error;
    }
  }

  async listForAdmin(query: ListJobReportsDto) {
    const { status, page, limit } = query;
    const skip = paginationSkip(page, limit);
    const [reports, total] = await this.jobReportsRepository.findForAdmin(
      status,
      skip,
      limit,
    );

    return { reports, pagination: buildPagination(page, limit, total) };
  }

  async resolve(
    id: string,
    dto: ResolveJobReportDto,
    admin: AuthenticatedUser,
  ) {
    const report = await this.jobReportsRepository.findByIdForAdmin(id);
    assertFound(report, "Report not found", ErrorCode.JOB_REPORT_NOT_FOUND);
    if (report.status !== "OPEN") {
      throw new BadRequestApiException(
        `Report is already ${report.status.toLowerCase()}`,
        ErrorCode.JOB_REPORT_ALREADY_RESOLVED,
      );
    }

    const newStatus = dto.action === "resolve" ? "RESOLVED" : "DISMISSED";
    const updated = await this.jobReportsRepository.updateStatus(
      id,
      newStatus,
      {
        adminId: admin.id,
        adminEmail: admin.email,
        action:
          dto.action === "resolve"
            ? "JOB_REPORT_RESOLVED"
            : "JOB_REPORT_DISMISSED",
        targetType: "JOB_REPORT",
        targetId: id,
        targetLabel: report.job.title,
        before: { status: "OPEN" },
        after: { status: newStatus, ...(dto.reason && { reason: dto.reason }) },
        ipAddress: admin.ipAddress,
      },
    );
    if (!updated) {
      throw new BadRequestApiException(
        "Report is no longer open",
        ErrorCode.JOB_REPORT_ALREADY_RESOLVED,
      );
    }

    const verb = dto.action === "resolve" ? "resolved" : "dismissed";

    runInBackground(
      this.notificationsService.create({
        userId: report.reporterId,
        type: "JOB_REPORT_RESOLVED",
        title:
          verb === "resolved"
            ? "Your report was resolved"
            : "Your report was dismissed",
        body: `Your report on "${report.job.title}" has been ${verb}.`,
        link: `/jobs/${report.job.slug}`,
      }),
      this.logger,
      `Failed to create job-report notification for report ${id}`,
    );

    if (dto.action === "resolve" && report.job.employer) {
      await this.notificationsService.create({
        userId: report.job.employer.userId,
        type: "JOB_REPORT_RESOLVED",
        title: "Job removed following a violation report",
        body: `Your listing "${report.job.title}" was closed. ${dto.reason ?? ""}`.trim(),
        link: "/employer-dashboard",
      });
    }

    return updated;
  }
}
