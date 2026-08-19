import { Injectable } from "@nestjs/common";
import { OwnershipGuardBase } from "@/common/authorization/ownership.guard";
import { ErrorCode } from "@/common/exceptions/error-codes";

export interface TalentOwnedApplication {
  talent: { userId: string };
}

/**
 * Shared base for the "talent owns this application" guard that each
 * per-application child-resource module (messages, interviews, ...) builds
 * its own copy of — every copy loaded the resource differently (its own
 * repository) but wired up an identical notFoundCode/forbiddenCode/
 * getOwnerUserId, which is what this factors out. Modules still each provide
 * their own loadResource rather than importing across feature module
 * boundaries.
 */
@Injectable()
export abstract class TalentApplicationOwnershipGuardBase<
  T extends TalentOwnedApplication,
> extends OwnershipGuardBase<T> {
  protected override readonly notFoundCode = ErrorCode.APPLICATION_NOT_FOUND;
  protected override readonly forbiddenCode =
    ErrorCode.APPLICATION_ACCESS_DENIED;

  protected override getOwnerUserId(application: T): string {
    return application.talent.userId;
  }
}
