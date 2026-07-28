import { Injectable } from "@nestjs/common";
import { OwnershipGuardBase } from "@/common/authorization/ownership.guard";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { EmployerRepository } from "../employer.repository";

export type JobOwnerOnly = NonNullable<
  Awaited<ReturnType<EmployerRepository["findJobWithEmployerOwner"]>>
>;

/** Guards GET /employer/jobs/:id/applications — no admin bypass (unlike jobs.update). */
@Injectable()
export class EmployerJobOwnershipGuard extends OwnershipGuardBase<JobOwnerOnly> {
  protected override readonly notFoundCode = ErrorCode.JOB_NOT_FOUND;
  protected override readonly forbiddenCode = ErrorCode.JOB_ACCESS_DENIED;

  constructor(private readonly employerRepository: EmployerRepository) {
    super();
  }

  protected override loadResource(id: string): Promise<JobOwnerOnly | null> {
    return this.employerRepository.findJobWithEmployerOwner(id);
  }

  protected override getOwnerUserId(job: JobOwnerOnly): string {
    return job.employer.userId;
  }
}
