import { Injectable } from "@nestjs/common";
import { OwnershipGuardBase } from "@/common/authorization/ownership.guard";
import { EmployerRepository } from "../employer.repository";

export type ApplicationWithJobOwner = NonNullable<
  Awaited<ReturnType<EmployerRepository["findApplicationWithJobOwner"]>>
>;

/** Guards PATCH /employer/applications/:id — no admin bypass. */
@Injectable()
export class ApplicationOwnershipGuard extends OwnershipGuardBase<ApplicationWithJobOwner> {
  constructor(private readonly employerRepository: EmployerRepository) {
    super();
  }

  protected loadResource(id: string): Promise<ApplicationWithJobOwner | null> {
    return this.employerRepository.findApplicationWithJobOwner(id);
  }

  protected getOwnerUserId(application: ApplicationWithJobOwner): string {
    return application.job.employer.userId;
  }
}
