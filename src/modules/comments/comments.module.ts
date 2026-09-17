import { Module } from "@nestjs/common";
import { CommentsService } from "./comments.service";
import { CommentsRepository } from "./comments.repository";

// No controller here — routes live on EmployerController, nested under
// applications/:id, same convention as ScorecardsModule (see its own
// comment): eligibility/access is per-application and already resolved by
// EmployerController's ApplicationAccessGuard before EmployerService
// delegates in. Unlike ScorecardsModule this imports nothing else — a
// comment has no eligibility check against another module's data.
@Module({
  providers: [CommentsService, CommentsRepository],
  exports: [CommentsService],
})
export class CommentsModule {}
