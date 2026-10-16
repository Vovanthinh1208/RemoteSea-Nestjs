import { Injectable } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import { CompanyOwnershipGuardBase } from "@/common/authorization/company-ownership.guard";
import { JOB_MANAGEMENT_ROLES } from "@/common/authorization/company-role.util";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { PrismaService } from "@/core/database/prisma.service";
import { JobsRepository } from "../jobs.repository";

export type JobWithOwner = NonNullable<
  Awaited<ReturnType<JobsRepository["findById"]>>
>;

@Injectable()
export class JobOwnershipGuard extends CompanyOwnershipGuardBase<JobWithOwner> {
  // Same tier as JobsService.create/EmployerService's job-management checks
  // — RECRUITER edits jobs, HIRING_MANAGER/INTERVIEWER don't.
  protected readonly allowedRoles = JOB_MANAGEMENT_ROLES;
  // Admins can edit any job regardless of company — JobsService.update still
  // checks user.role itself afterward, since admins also bypass the
  // DRAFT/REJECTED-only editing rule, not just this ownership check.
  // PB42 RC3 / PB45 RC3: ADMIN has no self-service edit or close. Admin
  // moderation goes through the admin module, not these routes.
  protected override readonly bypassAccountRoles: UserRole[] = [];
  protected override readonly notFoundCode = ErrorCode.JOB_NOT_FOUND;
  protected override readonly forbiddenCode = ErrorCode.JOB_ACCESS_DENIED;

  constructor(
    prisma: PrismaService,
    private readonly jobsRepository: JobsRepository,
  ) {
    super(prisma);
  }

  protected override loadResource(id: string): Promise<JobWithOwner | null> {
    return this.jobsRepository.findById(id);
  }

  protected getCompanyId(job: JobWithOwner): string {
    return job.employerId;
  }
}
