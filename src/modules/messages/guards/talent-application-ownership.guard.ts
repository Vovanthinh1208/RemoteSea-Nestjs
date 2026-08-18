import { Injectable } from "@nestjs/common";
import { TalentApplicationOwnershipGuardBase } from "@/common/authorization/talent-application-ownership.guard-base";
import { MessagesRepository } from "../messages.repository";

export type TalentApplicationOwner = NonNullable<
  Awaited<ReturnType<MessagesRepository["findApplicationForTalentOwnership"]>>
>;

/** Guards GET/POST applications/:id/messages (talent side) — the talent-side
 * twin of employer/guards/application-ownership.guard.ts. */
@Injectable()
export class TalentApplicationOwnershipGuard extends TalentApplicationOwnershipGuardBase<TalentApplicationOwner> {
  constructor(private readonly messagesRepository: MessagesRepository) {
    super();
  }

  protected override loadResource(
    id: string,
  ): Promise<TalentApplicationOwner | null> {
    return this.messagesRepository.findApplicationForTalentOwnership(id);
  }
}
