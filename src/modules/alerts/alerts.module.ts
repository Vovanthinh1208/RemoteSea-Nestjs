import { Module } from "@nestjs/common";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";
import { AlertsRepository } from "./alerts.repository";
import { CronSecretGuard } from "./guards/cron-secret.guard";

@Module({
  controllers: [AlertsController],
  providers: [AlertsService, AlertsRepository, CronSecretGuard],
})
export class AlertsModule {}
