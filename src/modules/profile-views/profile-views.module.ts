import { Module } from "@nestjs/common";
import { ProfileViewsService } from "./profile-views.service";
import { ProfileViewsRepository } from "./profile-views.repository";

// No controller — its one read (analytics) and one write (recordView) are
// only ever reached through TalentController/TalentService ("me/profile-views"
// and getPublicProfile respectively), never through a route of this
// module's own. That's deliberate: an analytics endpoint that only ever
// answers "my own" doesn't need a target-id URL to defend, and a view
// can't be recorded except as a side effect of actually loading a profile.
@Module({
  providers: [ProfileViewsService, ProfileViewsRepository],
  exports: [ProfileViewsService],
})
export class ProfileViewsModule {}
