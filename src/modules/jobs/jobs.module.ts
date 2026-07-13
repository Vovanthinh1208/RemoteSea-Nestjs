import { Module } from "@nestjs/common";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { JobsRepository } from "./jobs.repository";
import { JobOwnershipGuard } from "./guards/job-ownership.guard";

@Module({
  controllers: [JobsController],
  providers: [JobsService, JobsRepository, JobOwnershipGuard],
})
export class JobsModule {}
