import { Module } from "@nestjs/common";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { ApplicationsRepository } from "./applications.repository";

@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationsRepository],
  // TalentModule composes findAllForUser/getStatusCounts into
  // GET /talent/me/dashboard — see TalentService.getDashboard.
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
