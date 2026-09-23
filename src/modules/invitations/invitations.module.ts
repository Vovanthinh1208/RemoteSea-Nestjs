import { Module } from "@nestjs/common";
import { InvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";
import { InvitationsRepository } from "./invitations.repository";

@Module({
  controllers: [InvitationsController],
  providers: [InvitationsService, InvitationsRepository],
  // TalentModule composes listForTalent into GET /talent/me/dashboard — see
  // TalentService.getDashboard.
  exports: [InvitationsService],
})
export class InvitationsModule {}
