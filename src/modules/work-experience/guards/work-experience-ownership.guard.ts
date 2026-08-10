import { Injectable } from "@nestjs/common";
import { OwnershipGuardBase } from "@/common/authorization/ownership.guard";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { WorkExperienceRepository } from "../work-experience.repository";

export type WorkExperienceWithOwner = NonNullable<
  Awaited<ReturnType<WorkExperienceRepository["findOwnerById"]>>
>;

@Injectable()
export class WorkExperienceOwnershipGuard extends OwnershipGuardBase<WorkExperienceWithOwner> {
  // Same as AlertOwnershipGuard — another user's entry 404s rather than
  // 403s, so its existence isn't confirmed to a non-owner.
  protected override readonly notFoundOnMismatch = true;
  protected override readonly notFoundCode =
    ErrorCode.WORK_EXPERIENCE_NOT_FOUND;

  constructor(
    private readonly workExperienceRepository: WorkExperienceRepository,
  ) {
    super();
  }

  protected override loadResource(
    id: string,
  ): Promise<WorkExperienceWithOwner | null> {
    return this.workExperienceRepository.findOwnerById(id);
  }

  protected override getOwnerUserId(resource: WorkExperienceWithOwner): string {
    return resource.talent.userId;
  }
}
