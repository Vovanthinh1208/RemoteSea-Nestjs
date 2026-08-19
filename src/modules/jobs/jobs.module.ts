import { Module } from "@nestjs/common";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { JobsRepository } from "./jobs.repository";
import { JobOwnershipGuard } from "./guards/job-ownership.guard";
import { ViewCountBuffer } from "./view-count.buffer";
import { EmployerModule } from "@/modules/employer/employer.module";
import { CompanyModule } from "@/modules/company/company.module";

@Module({
  // JobsService.getActiveById calls EmployerService.getPublicResponseHours
  // to surface the employer's response-time stat on the public job detail
  // page — EmployerModule doesn't import JobsModule, so no cycle.
  // CompanyModule: multi-seat company/role resolution for job creation.
  imports: [EmployerModule, CompanyModule],
  controllers: [JobsController],
  providers: [JobsService, JobsRepository, JobOwnershipGuard, ViewCountBuffer],
  // AdminModule calls JobsService.approveForReview/rejectForReview for
  // admin-triggered job moderation — see admin.service.ts.
  exports: [JobsService],
})
export class JobsModule {}
