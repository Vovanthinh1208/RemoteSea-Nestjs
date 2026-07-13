import { Module } from "@nestjs/common";
import { EmployerController } from "./employer.controller";
import { EmployerService } from "./employer.service";
import { EmployerRepository } from "./employer.repository";
import { EmployerJobOwnershipGuard } from "./guards/employer-job-ownership.guard";
import { ApplicationOwnershipGuard } from "./guards/application-ownership.guard";
import { UploadsModule } from "@/modules/uploads/uploads.module";

@Module({
  imports: [UploadsModule],
  controllers: [EmployerController],
  providers: [
    EmployerService,
    EmployerRepository,
    EmployerJobOwnershipGuard,
    ApplicationOwnershipGuard,
  ],
})
export class EmployerModule {}
