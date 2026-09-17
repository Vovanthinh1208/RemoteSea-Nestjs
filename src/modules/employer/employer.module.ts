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
import { ScorecardsModule } from "@/modules/scorecards/scorecards.module";
import { CommentsModule } from "@/modules/comments/comments.module";
import { CvAnalysisModule } from "@/modules/cv-analysis/cv-analysis.module";
import { CompanyModule } from "@/modules/company/company.module";

@Module({
  // MessagesModule/InterviewsModule/ScorecardsModule/CommentsModule/
  // CvAnalysisModule: EmployerService delegates to their services
  // (listApplicationMessages/sendApplicationMessage,
  // getApplicationInterview/proposeInterview,
  // listApplicationScorecards/submitApplicationScorecard,
  // listApplicationComments/addApplicationComment,
  // getApplicationCvAnalysis), same shape as AdminModule -> JobReportsModule.
  // CompanyModule: multi-seat company/role resolution
  // (CompanyMembershipService.resolveMembership), used everywhere this
  // service used to look up an EmployerProfile by userId alone.
  imports: [
    UploadsModule,
    MessagesModule,
    InterviewsModule,
    ScorecardsModule,
    CommentsModule,
    CvAnalysisModule,
    CompanyModule,
  ],
  controllers: [EmployerController, CompaniesController],
  providers: [
    EmployerService,
    EmployerRepository,
    EmployerJobOwnershipGuard,
    ApplicationOwnershipGuard,
    ApplicationAccessGuard,
  ],
  // AdminModule calls EmployerService.setVerified/suspend for admin-triggered
  // employer moderation — see admin.service.ts. ApplicationAccessGuard:
  // AiOrchestratorModule's tool routes reuse this exact guard (same
  // company-role + assigned-interviewer check as the real employer routes
  // above) rather than reimplementing application access control for tools.
  // EmployerRepository is exported alongside it purely because Nest
  // resolves a class passed to @UseGuards() fresh in the consuming module's
  // own injector context — it needs the guard's full constructor dependency
  // chain reachable there too, not just the guard class itself.
  exports: [EmployerService, ApplicationAccessGuard, EmployerRepository],
})
export class EmployerModule {}
