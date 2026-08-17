import { Module } from "@nestjs/common";
import { EmployerController } from "./employer.controller";
import { CompaniesController } from "./companies.controller";
import { EmployerService } from "./employer.service";
import { EmployerRepository } from "./employer.repository";
import { EmployerJobOwnershipGuard } from "./guards/employer-job-ownership.guard";
import { ApplicationOwnershipGuard } from "./guards/application-ownership.guard";
import { UploadsModule } from "@/modules/uploads/uploads.module";

@Module({
  imports: [UploadsModule],
  controllers: [EmployerController, CompaniesController],
  providers: [
    EmployerService,
    EmployerRepository,
    EmployerJobOwnershipGuard,
    ApplicationOwnershipGuard,
  ],
  // AdminModule calls EmployerService.setVerified/suspend for admin-triggered
  // employer moderation — see admin.service.ts.
  exports: [EmployerService],
})
export class EmployerModule {}
