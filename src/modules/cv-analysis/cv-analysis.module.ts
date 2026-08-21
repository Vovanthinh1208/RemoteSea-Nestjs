import { Module } from "@nestjs/common";
import { CvAnalysisService } from "./cv-analysis.service";
import { CvAnalysisRepository } from "./cv-analysis.repository";
import { ResumeExtractionService } from "./resume-extraction.service";
import { AiModule } from "@/modules/ai/ai.module";

// No controller here — same reasoning as ScorecardsModule: the route lives
// on EmployerController, nested under applications/:id, where
// ApplicationAccessGuard has already resolved eligibility.
@Module({
  imports: [AiModule],
  providers: [CvAnalysisService, CvAnalysisRepository, ResumeExtractionService],
  exports: [CvAnalysisService],
})
export class CvAnalysisModule {}
