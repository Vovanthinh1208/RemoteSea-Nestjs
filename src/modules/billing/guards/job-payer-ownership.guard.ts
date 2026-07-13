import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { OwnershipGuardBase } from "@/common/authorization/ownership.guard";
import { BillingRepository } from "../billing.repository";

export type JobPayer = NonNullable<
  Awaited<ReturnType<BillingRepository["findJobWithEmployer"]>>
>;

/**
 * Guards POST /billing/checkout. The job id comes from the request body
 * (`{ jobId }`), not a route param — reads the raw body since guards run
 * before the ZodValidationPipe. Throws 404 (not 403) on a non-owner match,
 * matching the original BillingService check, so a non-owner probing job ids
 * can't distinguish "not yours" from "doesn't exist".
 */
@Injectable()
export class JobPayerOwnershipGuard extends OwnershipGuardBase<JobPayer> {
  protected readonly notFoundOnMismatch = true;
  protected readonly notFoundMessage = "Job not found";

  constructor(private readonly billingRepository: BillingRepository) {
    super();
  }

  protected extractResourceId(request: Request): string {
    return (request.body as { jobId?: string } | undefined)?.jobId ?? "";
  }

  protected loadResource(jobId: string): Promise<JobPayer | null> {
    return this.billingRepository.findJobWithEmployer(jobId);
  }

  protected getOwnerUserId(job: JobPayer): string {
    return job.employer.userId;
  }
}
