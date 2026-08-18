import { Module } from "@nestjs/common";
import { InterviewsController } from "./interviews.controller";
import { InterviewsService } from "./interviews.service";
import { InterviewsRepository } from "./interviews.repository";
import { TalentApplicationOwnershipGuard } from "./guards/talent-application-ownership.guard";

@Module({
  controllers: [InterviewsController],
  providers: [
    InterviewsService,
    InterviewsRepository,
    TalentApplicationOwnershipGuard,
  ],
  // EmployerModule calls InterviewsService.get/propose for the employer-side
  // applications/:id/interview routes — see employer.service.ts.
  exports: [InterviewsService],
})
export class InterviewsModule {}
