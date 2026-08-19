import { Injectable } from "@nestjs/common";
import { TalentApplicationOwnershipGuardBase } from "@/common/authorization/talent-application-ownership.guard-base";
import { InterviewsRepository } from "../interviews.repository";

export type TalentApplicationOwner = NonNullable<
  Awaited<ReturnType<InterviewsRepository["findApplicationForTalentOwnership"]>>
>;

/** Guards GET applications/:id/interview and PATCH .../confirm (talent side)
 * — the talent-side twin of employer/guards/application-ownership.guard.ts,
 * own copy rather than a cross-import, same as messages' own twin. */
@Injectable()
export class TalentApplicationOwnershipGuard extends TalentApplicationOwnershipGuardBase<TalentApplicationOwner> {
  constructor(private readonly interviewsRepository: InterviewsRepository) {
    super();
  }

  protected override loadResource(
    id: string,
  ): Promise<TalentApplicationOwner | null> {
    return this.interviewsRepository.findApplicationForTalentOwnership(id);
  }
}
