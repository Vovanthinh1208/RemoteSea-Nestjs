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
  protected readonly notFoundCode = ErrorCode.JOB_NOT_FOUND;
  protected readonly forbiddenCode = ErrorCode.JOB_ACCESS_DENIED;

  constructor(private readonly employerRepository: EmployerRepository) {
    super();
  }

  protected loadResource(id: string): Promise<JobOwnerOnly | null> {
    return this.employerRepository.findJobWithEmployerOwner(id);
  }

  protected getOwnerUserId(job: JobOwnerOnly): string {
    return job.employer.userId;
  }
}
