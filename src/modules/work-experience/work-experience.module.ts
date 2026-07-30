import { Module } from "@nestjs/common";
import { WorkExperienceController } from "./work-experience.controller";
import { WorkExperienceService } from "./work-experience.service";
import { WorkExperienceRepository } from "./work-experience.repository";
import { WorkExperienceOwnershipGuard } from "./guards/work-experience-ownership.guard";

@Module({
  controllers: [WorkExperienceController],
  providers: [
    WorkExperienceService,
    WorkExperienceRepository,
    WorkExperienceOwnershipGuard,
  ],
})
export class WorkExperienceModule {}
