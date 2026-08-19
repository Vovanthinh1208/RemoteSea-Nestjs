import { Injectable } from "@nestjs/common";
import { CompanyOwnershipGuardBase } from "@/common/authorization/company-ownership.guard";
import { APPLICATION_REVIEW_ROLES } from "@/common/authorization/company-role.util";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { PrismaService } from "@/core/database/prisma.service";
import { EmployerRepository } from "../employer.repository";

export type JobOwnerOnly = NonNullable<
  Awaited<ReturnType<EmployerRepository["findJobWithEmployerOwner"]>>
>;

/**
 * Guards GET /employer/jobs/:id/applications — the full applicant list for a
 * job, so INTERVIEWER (assigned-only, never a company-wide browse) isn't in
 * allowedRoles at all; there's no per-application resource here to assign
 * them against.
 */
@Injectable()
export class EmployerJobOwnershipGuard extends CompanyOwnershipGuardBase<JobOwnerOnly> {
  protected readonly allowedRoles = APPLICATION_REVIEW_ROLES;
  protected override readonly notFoundCode = ErrorCode.JOB_NOT_FOUND;
  protected override readonly forbiddenCode = ErrorCode.JOB_ACCESS_DENIED;

  constructor(
    prisma: PrismaService,
    private readonly employerRepository: EmployerRepository,
  ) {
    super(prisma);
  }

  protected loadResource(id: string): Promise<JobOwnerOnly | null> {
    return this.employerRepository.findJobWithEmployerOwner(id);
  }

  protected getCompanyId(job: JobOwnerOnly): string {
    return job.employerId;
  }
}
