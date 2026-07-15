import { Module } from "@nestjs/common";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { JobsRepository } from "./jobs.repository";
import { JobOwnershipGuard } from "./guards/job-ownership.guard";
import { ViewCountBuffer } from "./view-count.buffer";

@Module({
  controllers: [JobsController],
  providers: [JobsService, JobsRepository, JobOwnershipGuard, ViewCountBuffer],
})
export class JobsModule {}
