import { Module } from "@nestjs/common";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";
import { AlertsRepository } from "./alerts.repository";
import { CronSecretGuard } from "./guards/cron-secret.guard";
import { AlertOwnershipGuard } from "./guards/alert-ownership.guard";

@Module({
  controllers: [AlertsController],
  providers: [
    AlertsService,
    AlertsRepository,
    CronSecretGuard,
    AlertOwnershipGuard,
  ],
  // TalentModule composes listForUser into GET /talent/me/dashboard — see
  // TalentService.getDashboard.
  exports: [AlertsService],
})
export class AlertsModule {}
