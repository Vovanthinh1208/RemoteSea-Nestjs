import { Module } from "@nestjs/common";
import { AiOrchestratorController } from "./ai-orchestrator.controller";
import { AiOrchestratorService } from "./ai-orchestrator.service";
import { OrchestratorAuthGuard } from "./guards/orchestrator-auth.guard";
import { ToolsController } from "./tools/tools.controller";
import { CompanyModule } from "@/modules/company/company.module";
import { EmployerModule } from "@/modules/employer/employer.module";
import { JobsModule } from "@/modules/jobs/jobs.module";

@Module({
  // EmployerModule/JobsModule: ToolsController delegates to EmployerService/
  // JobsService and reuses EmployerModule's ApplicationAccessGuard — see
  // that guard's export comment in employer.module.ts.
  imports: [CompanyModule, EmployerModule, JobsModule],
  controllers: [AiOrchestratorController, ToolsController],
  providers: [AiOrchestratorService, OrchestratorAuthGuard],
  exports: [AiOrchestratorService],
})
export class AiOrchestratorModule {}
