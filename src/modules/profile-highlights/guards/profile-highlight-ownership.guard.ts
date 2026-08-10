import { Injectable } from "@nestjs/common";
import { OwnershipGuardBase } from "@/common/authorization/ownership.guard";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { ProfileHighlightsRepository } from "../profile-highlights.repository";

export type ProfileHighlightWithOwner = NonNullable<
  Awaited<ReturnType<ProfileHighlightsRepository["findOwnerById"]>>
>;

@Injectable()
export class ProfileHighlightOwnershipGuard extends OwnershipGuardBase<ProfileHighlightWithOwner> {
  // Same as WorkExperienceOwnershipGuard — another user's entry 404s rather
  // than 403s, so its existence isn't confirmed to a non-owner.
  protected override readonly notFoundOnMismatch = true;
  protected override readonly notFoundCode =
    ErrorCode.PROFILE_HIGHLIGHT_NOT_FOUND;

  constructor(
    private readonly profileHighlightsRepository: ProfileHighlightsRepository,
  ) {
    super();
  }

  protected override loadResource(
    id: string,
  ): Promise<ProfileHighlightWithOwner | null> {
    return this.profileHighlightsRepository.findOwnerById(id);
  }

  protected override getOwnerUserId(
    resource: ProfileHighlightWithOwner,
  ): string {
    return resource.talent.userId;
  }
}
