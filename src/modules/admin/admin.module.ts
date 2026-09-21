import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminRepository } from "./admin.repository";
import { EmployerModule } from "@/modules/employer/employer.module";
import { JobsModule } from "@/modules/jobs/jobs.module";
import { JobReportsModule } from "@/modules/job-reports/job-reports.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { JobModerationModule } from "@/modules/job-moderation/job-moderation.module";

@Module({
  // Employer/job state transitions (verify/suspend, approve/reject) and job
  // report review are owned by those modules — see admin.service.ts.
  // AuthModule: ban/role-change revokes the target user's sessions via
  // AuthService (AuthModule already exports it for TalentModule's own use).
  // JobModerationModule: the advisory AI risk-check backing
  // getJobModerationFlag — a read-only hiring/trust aid, not a state
  // transition, so it stays a separate module rather than folding into
  // JobsModule.
  imports: [
    EmployerModule,
    JobsModule,
    JobReportsModule,
    AuthModule,
    JobModerationModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}
