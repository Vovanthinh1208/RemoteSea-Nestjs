import { Injectable } from "@nestjs/common";
import { OwnershipGuardBase } from "@/common/authorization/ownership.guard";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { MessagesRepository } from "../messages.repository";

export type TalentApplicationOwner = NonNullable<
  Awaited<ReturnType<MessagesRepository["findApplicationForTalentOwnership"]>>
>;

/** Guards GET/POST applications/:id/messages (talent side) — the talent-side
 * twin of employer/guards/application-ownership.guard.ts. */
@Injectable()
export class TalentApplicationOwnershipGuard extends OwnershipGuardBase<TalentApplicationOwner> {
  protected override readonly notFoundCode = ErrorCode.APPLICATION_NOT_FOUND;
  protected override readonly forbiddenCode =
    ErrorCode.APPLICATION_ACCESS_DENIED;

  constructor(private readonly messagesRepository: MessagesRepository) {
    super();
  }

  protected override loadResource(
    id: string,
  ): Promise<TalentApplicationOwner | null> {
    return this.messagesRepository.findApplicationForTalentOwnership(id);
  }

  protected override getOwnerUserId(
    application: TalentApplicationOwner,
  ): string {
    return application.talent.userId;
  }
}
