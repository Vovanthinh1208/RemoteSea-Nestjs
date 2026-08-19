import { Injectable } from "@nestjs/common";
import { CompanyOwnershipGuardBase } from "@/common/authorization/company-ownership.guard";
import { APPLICATION_REVIEW_ROLES } from "@/common/authorization/company-role.util";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { PrismaService } from "@/core/database/prisma.service";
import { EmployerRepository } from "../employer.repository";

export type ApplicationWithJobOwner = NonNullable<
  Awaited<ReturnType<EmployerRepository["findApplicationWithJobOwner"]>>
>;

/**
 * Guards PATCH /employer/applications/:id (status changes) and
 * POST /employer/applications/:id/interview (scheduling). Deliberately no
 * assigned-interviewer bypass here (see ApplicationAccessGuard, which
 * extends this for the view-only/messaging routes) — changing an
 * application's status or (re)proposing interview times is a
 * RECRUITER/HIRING_MANAGER-tier action, not something an assigned
 * INTERVIEWER does themselves.
 */
@Injectable()
export class ApplicationOwnershipGuard extends CompanyOwnershipGuardBase<ApplicationWithJobOwner> {
  protected readonly allowedRoles = APPLICATION_REVIEW_ROLES;
  protected override readonly notFoundCode = ErrorCode.APPLICATION_NOT_FOUND;
  protected override readonly forbiddenCode =
    ErrorCode.APPLICATION_ACCESS_DENIED;

  constructor(
    prisma: PrismaService,
    private readonly employerRepository: EmployerRepository,
  ) {
    super(prisma);
  }

  protected loadResource(id: string): Promise<ApplicationWithJobOwner | null> {
    return this.employerRepository.findApplicationWithJobOwner(id);
  }

  protected getCompanyId(application: ApplicationWithJobOwner): string {
    return application.job.employerId;
  }
}
