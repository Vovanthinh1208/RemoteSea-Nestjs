import { Module } from "@nestjs/common";
import { EmployerController } from "./employer.controller";
import { CompaniesController } from "./companies.controller";
import { EmployerService } from "./employer.service";
import { EmployerRepository } from "./employer.repository";
import { EmployerJobOwnershipGuard } from "./guards/employer-job-ownership.guard";
import { ApplicationOwnershipGuard } from "./guards/application-ownership.guard";
import { ApplicationAccessGuard } from "./guards/application-access.guard";
import { UploadsModule } from "@/modules/uploads/uploads.module";
import { MessagesModule } from "@/modules/messages/messages.module";
import { InterviewsModule } from "@/modules/interviews/interviews.module";
import { CompanyModule } from "@/modules/company/company.module";

@Module({
  // MessagesModule/InterviewsModule: EmployerService delegates to their
  // services (listApplicationMessages/sendApplicationMessage,
  // getApplicationInterview/proposeInterview), same shape as
  // AdminModule -> JobReportsModule. CompanyModule: multi-seat company/role
  // resolution (CompanyMembershipService.resolveMembership), used everywhere
  // this service used to look up an EmployerProfile by userId alone.
  imports: [UploadsModule, MessagesModule, InterviewsModule, CompanyModule],
  controllers: [EmployerController, CompaniesController],
  providers: [
    EmployerService,
    EmployerRepository,
    EmployerJobOwnershipGuard,
    ApplicationOwnershipGuard,
    ApplicationAccessGuard,
  ],
  // AdminModule calls EmployerService.setVerified/suspend for admin-triggered
  // employer moderation — see admin.service.ts.
  exports: [EmployerService],
})
export class EmployerModule {}
