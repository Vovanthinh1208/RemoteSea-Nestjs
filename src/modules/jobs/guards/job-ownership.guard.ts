import { Injectable } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import { OwnershipGuardBase } from "@/common/authorization/ownership.guard";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { JobsRepository } from "../jobs.repository";

export type JobWithOwner = NonNullable<
  Awaited<ReturnType<JobsRepository["findById"]>>
>;

@Injectable()
export class JobOwnershipGuard extends OwnershipGuardBase<JobWithOwner> {
  // Admins can edit any job regardless of ownership — JobsService.update still
  // checks user.role itself afterward, since admins also bypass the
  // DRAFT/REJECTED-only editing rule, not just this ownership check.
  protected override readonly bypassRoles: UserRole[] = ["ADMIN"];
  protected override readonly notFoundCode = ErrorCode.JOB_NOT_FOUND;
  protected override readonly forbiddenCode = ErrorCode.JOB_ACCESS_DENIED;

  constructor(private readonly jobsRepository: JobsRepository) {
    super();
  }

  protected override loadResource(id: string): Promise<JobWithOwner | null> {
    return this.jobsRepository.findById(id);
  }

  protected override getOwnerUserId(job: JobWithOwner): string {
    return job.employer.userId;
  }
}
