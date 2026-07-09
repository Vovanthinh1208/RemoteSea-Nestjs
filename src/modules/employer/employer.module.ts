import { Module } from "@nestjs/common";
import { EmployerController } from "./employer.controller";
import { EmployerService } from "./employer.service";
import { EmployerRepository } from "./employer.repository";
import { UploadsModule } from "@/modules/uploads/uploads.module";

@Module({
  imports: [UploadsModule],
  controllers: [EmployerController],
  providers: [EmployerService, EmployerRepository],
})
export class EmployerModule {}
