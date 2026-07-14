import { Injectable } from "@nestjs/common";
import { OwnershipGuardBase } from "@/common/authorization/ownership.guard";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { AlertsRepository } from "../alerts.repository";

export type AlertOwnerOnly = NonNullable<
  Awaited<ReturnType<AlertsRepository["findOwnerById"]>>
>;

/**
 * Guards PATCH /alerts/:id and DELETE /alerts/:id. Matches AlertsService's
 * original assertOwnership(): a missing alert and someone else's alert both
 * resolve to the same 404 (notFoundOnMismatch), not a 403 — this predates the
 * guard layer and may have just been the simplest code rather than a deliberate
 * "don't leak existence" choice (unlike billing's payer guard, where it is
 * deliberate), but it's preserved here rather than silently changed.
 */
@Injectable()
export class AlertOwnershipGuard extends OwnershipGuardBase<AlertOwnerOnly> {
  protected readonly notFoundOnMismatch = true;
  protected readonly notFoundMessage = "Alert not found";
  protected readonly notFoundCode = ErrorCode.ALERT_NOT_FOUND;

  constructor(private readonly alertsRepository: AlertsRepository) {
    super();
  }

  protected loadResource(id: string): Promise<AlertOwnerOnly | null> {
    return this.alertsRepository.findOwnerById(id);
  }

  protected getOwnerUserId(alert: AlertOwnerOnly): string {
    return alert.userId;
  }
}
