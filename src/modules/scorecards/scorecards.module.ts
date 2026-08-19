import { Module } from "@nestjs/common";
import { ScorecardsService } from "./scorecards.service";
import { ScorecardsRepository } from "./scorecards.repository";
import { InterviewsModule } from "@/modules/interviews/interviews.module";

@Module({
  // No controller here — routes live on EmployerController, nested under
  // applications/:id like interviews/messages, since eligibility is
  // per-application and access is already resolved by EmployerModule's
  // ApplicationAccessGuard before EmployerService delegates in.
  // InterviewsModule: ScorecardsService asks InterviewsService.isComplete
  // for eligibility instead of querying the interviews table itself —
  // Interview is that module's aggregate, not this one's.
  imports: [InterviewsModule],
  providers: [ScorecardsService, ScorecardsRepository],
  exports: [ScorecardsService],
})
export class ScorecardsModule {}
