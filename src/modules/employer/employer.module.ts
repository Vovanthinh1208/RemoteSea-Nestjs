import { Module } from "@nestjs/common";
import { EmployerController } from "./employer.controller";
import { EmployerService } from "./employer.service";
import { EmployerRepository } from "./employer.repository";

@Module({
  controllers: [EmployerController],
  providers: [EmployerService, EmployerRepository],
  exports: [EmployerService],
})
export class EmployerModule {}
