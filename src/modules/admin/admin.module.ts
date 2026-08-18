import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminRepository } from "./admin.repository";
import { EmployerModule } from "@/modules/employer/employer.module";
import { JobsModule } from "@/modules/jobs/jobs.module";
import { JobReportsModule } from "@/modules/job-reports/job-reports.module";

@Module({
  // Employer/job state transitions (verify/suspend, approve/reject) and job
  // report review are owned by those modules — see admin.service.ts.
  imports: [EmployerModule, JobsModule, JobReportsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}
