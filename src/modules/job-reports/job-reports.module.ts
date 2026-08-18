import { Module } from "@nestjs/common";
import { JobReportsController } from "./job-reports.controller";
import { JobReportsService } from "./job-reports.service";
import { JobReportsRepository } from "./job-reports.repository";

@Module({
  controllers: [JobReportsController],
  providers: [JobReportsService, JobReportsRepository],
  // AdminModule calls JobReportsService.listForAdmin/resolve for the admin
  // Reports tab — see admin.service.ts.
  exports: [JobReportsService],
})
export class JobReportsModule {}
