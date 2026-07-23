import { Injectable } from "@nestjs/common";
import { OwnershipGuardBase } from "@/common/authorization/ownership.guard";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { EmployerRepository } from "../employer.repository";

export type ApplicationWithJobOwner = NonNullable<
  Awaited<ReturnType<EmployerRepository["findApplicationWithJobOwner"]>>
>;

/** Guards PATCH /employer/applications/:id — no admin bypass. */
@Injectable()
export class ApplicationOwnershipGuard extends OwnershipGuardBase<ApplicationWithJobOwner> {
  protected override readonly notFoundCode = ErrorCode.APPLICATION_NOT_FOUND;
  protected override readonly forbiddenCode =
    ErrorCode.APPLICATION_ACCESS_DENIED;

  constructor(private readonly employerRepository: EmployerRepository) {
    super();
  }

  protected override loadResource(
    id: string,
  ): Promise<ApplicationWithJobOwner | null> {
    return this.employerRepository.findApplicationWithJobOwner(id);
  }

  protected override getOwnerUserId(
    application: ApplicationWithJobOwner,
  ): string {
    return application.job.employer.userId;
  }
}
