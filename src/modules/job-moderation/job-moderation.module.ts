import { Module } from "@nestjs/common";
import { JobModerationService } from "./job-moderation.service";
import { JobModerationRepository } from "./job-moderation.repository";
import { AiModule } from "@/modules/ai/ai.module";

// No controller here — same reasoning as CvAnalysisModule: the route lives
// on AdminController, where RolesGuard has already gated ADMIN access.
@Module({
  imports: [AiModule],
  providers: [JobModerationService, JobModerationRepository],
  exports: [JobModerationService],
})
export class JobModerationModule {}
