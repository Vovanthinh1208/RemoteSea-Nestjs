import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { CompanyOwnershipGuardBase } from "@/common/authorization/company-ownership.guard";
import { OWNER_ONLY } from "@/common/authorization/company-role.util";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { PrismaService } from "@/core/database/prisma.service";
import { BillingRepository } from "../billing.repository";

export type JobPayer = NonNullable<
  Awaited<ReturnType<BillingRepository["findJobWithEmployer"]>>
>;

/**
 * Guards POST /billing/checkout. The job id comes from the request body
 * (`{ jobId }`), not a route param — reads the raw body since guards run
 * before the ZodValidationPipe. Throws 404 (not 403) on a non-member match,
 * matching the original BillingService check, so a non-member probing job
 * ids can't distinguish "not your company's" from "doesn't exist". OWNER
 * only — paying for a job posting is a financial action, kept off
 * RECRUITER's otherwise-broad "manage jobs" tier deliberately.
 */
@Injectable()
export class JobPayerOwnershipGuard extends CompanyOwnershipGuardBase<JobPayer> {
  protected readonly allowedRoles = OWNER_ONLY;
  protected override readonly notFoundOnMismatch = true;
  protected override readonly notFoundMessage = "Job not found";
  protected override readonly notFoundCode = ErrorCode.JOB_NOT_FOUND;

  constructor(
    prisma: PrismaService,
    private readonly billingRepository: BillingRepository,
  ) {
    super(prisma);
  }

  protected override extractResourceId(request: Request): string {
    return (request.body as { jobId?: string } | undefined)?.jobId ?? "";
  }

  protected loadResource(jobId: string): Promise<JobPayer | null> {
    return this.billingRepository.findJobWithEmployer(jobId);
  }

  protected getCompanyId(job: JobPayer): string {
    return job.employerId;
  }
}
