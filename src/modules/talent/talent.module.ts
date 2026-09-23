import { Module } from "@nestjs/common";
import { TalentController } from "./talent.controller";
import { TalentService } from "./talent.service";
import { TalentRepository } from "./talent.repository";
import { UploadsModule } from "@/modules/uploads/uploads.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { ProfileViewsModule } from "@/modules/profile-views/profile-views.module";
import { ApplicationsModule } from "@/modules/applications/applications.module";
import { SavedModule } from "@/modules/saved/saved.module";
import { AlertsModule } from "@/modules/alerts/alerts.module";
import { InvitationsModule } from "@/modules/invitations/invitations.module";

@Module({
  // ApplicationsModule/SavedModule/AlertsModule/InvitationsModule: TalentService
  // composes their per-user reads into GET /talent/me/dashboard, same shape as
  // EmployerModule importing MessagesModule/InterviewsModule/etc. — see
  // TalentService.getDashboard.
  imports: [
    UploadsModule,
    AuthModule,
    ProfileViewsModule,
    ApplicationsModule,
    SavedModule,
    AlertsModule,
    InvitationsModule,
  ],
  controllers: [TalentController],
  providers: [TalentService, TalentRepository],
})
export class TalentModule {}
