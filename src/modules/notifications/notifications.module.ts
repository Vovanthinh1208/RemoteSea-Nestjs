import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationsRepository } from "./notifications.repository";

// Global so InvitationsService/EmployerService/JobReportsService can inject
// NotificationsService directly, the same way they already inject
// EmailService/RateLimitService from SharedServicesModule — Notifications
// has no dependency back on any of them, so there's no circular-import risk
// to design around.
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  exports: [NotificationsService],
})
export class NotificationsModule {}
