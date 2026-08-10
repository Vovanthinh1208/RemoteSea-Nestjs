import { Module } from "@nestjs/common";
import { ProfileHighlightsController } from "./profile-highlights.controller";
import { ProfileHighlightsService } from "./profile-highlights.service";
import { ProfileHighlightsRepository } from "./profile-highlights.repository";
import { ProfileHighlightOwnershipGuard } from "./guards/profile-highlight-ownership.guard";

@Module({
  controllers: [ProfileHighlightsController],
  providers: [
    ProfileHighlightsService,
    ProfileHighlightsRepository,
    ProfileHighlightOwnershipGuard,
  ],
})
export class ProfileHighlightsModule {}
