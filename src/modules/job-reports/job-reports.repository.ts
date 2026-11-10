import type { RecordAuditLogInput } from "@/common/services/audit-log.service";
import { Injectable } from "@nestjs/common";
import type { Job, JobReport, JobReportStatus } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  adminJobReportSelect,
  type AdminJobReport,
  type CreateJobReportInput,
} from "./interfaces";

@Injectable()
export class JobReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findJobForReport(jobId: string): Promise<Pick<Job, "id"> | null> {
    return this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
  }

  /** Backs the "one OPEN report per (job, reporter)" service-layer dedup
   * check — a plain read-check, not a DB constraint (see schema.prisma's
   * comment on JobReport for why). */
  findOpenByJobAndReporter(
    jobId: string,
    reporterId: string,
  ): Promise<Pick<JobReport, "id"> | null> {
    return this.prisma.jobReport.findFirst({
      where: { jobId, reporterId },
      select: { id: true },
    });
  }

  create(
    input: CreateJobReportInput,
  ): Promise<Pick<JobReport, "id" | "status">> {
    return this.prisma.jobReport.create({
      data: {
        jobId: input.jobId,
        reporterId: input.reporterId,
        reason: input.reason,
        details: input.details,
      },
      select: { id: true, status: true },
    });
  }

  findByIdForAdmin(id: string) {
    return this.prisma.jobReport.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        reporterId: true,
        jobId: true,
        job: {
          select: {
            title: true,
            slug: true,
            employer: { select: { userId: true } },
          },
        },
      },
    });
  }

  async findForAdmin(
    status: JobReportStatus,
    skip: number,
    take: number,
  ): Promise<[AdminJobReport[], number]> {
    const where = { status };
    const [reports, total] = await Promise.all([
      this.prisma.jobReport.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: adminJobReportSelect,
      }),
      this.prisma.jobReport.count({ where }),
    ]);
    return [reports, total];
  }

  // Atomic conditional update, same "re-check OPEN at write time" reasoning
  // as JobsRepository.approveJob/rejectJob — two admins resolving the same
  // report concurrently must not both succeed.
  async updateStatus(
    id: string,
    status: Extract<JobReportStatus, "RESOLVED" | "DISMISSED">,
    audit?: RecordAuditLogInput,
  ): Promise<Pick<JobReport, "id" | "status" | "resolvedAt"> | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.jobReport.updateMany({
        where: { id, status: "OPEN" },
        data: { status, resolvedAt: new Date() },
      });
      if (count === 0) return null;

      const report = await tx.jobReport.findUniqueOrThrow({ where: { id } });
      if (status === "RESOLVED") {
        await tx.job.update({
          where: { id: report.jobId },
          data: { status: "CLOSED" },
        });
      }
      if (audit) await tx.adminAuditLog.create({ data: audit });
      return tx.jobReport.findUnique({
        where: { id },
        select: { id: true, status: true, resolvedAt: true },
      });
    });
  }
}
