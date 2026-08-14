import { Module } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { validateEnv } from "@/core/config/env.validation";
import { PrismaModule } from "@/core/database/prisma.module";
import { SharedServicesModule } from "@/common/services/shared-services.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { UsersModule } from "@/modules/users/users.module";
import { TalentModule } from "@/modules/talent/talent.module";
import { WorkExperienceModule } from "@/modules/work-experience/work-experience.module";
import { ProfileHighlightsModule } from "@/modules/profile-highlights/profile-highlights.module";
import { EmployerModule } from "@/modules/employer/employer.module";
import { JobsModule } from "@/modules/jobs/jobs.module";
import { TaxonomyModule } from "@/modules/taxonomy/taxonomy.module";
import { SalaryModule } from "@/modules/salary/salary.module";
import { ApplicationsModule } from "@/modules/applications/applications.module";
import { InvitationsModule } from "@/modules/invitations/invitations.module";
import { SavedModule } from "@/modules/saved/saved.module";
import { AdminModule } from "@/modules/admin/admin.module";
import { AlertsModule } from "@/modules/alerts/alerts.module";
import { BillingModule } from "@/modules/billing/billing.module";
import { UploadsModule } from "@/modules/uploads/uploads.module";
import { HealthModule } from "@/modules/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    // In-memory TTL cache, no external store — each cache.set() call sets its
    // own TTL (see cache.util.ts), so no default here.
    CacheModule.register({ isGlobal: true }),
    PrismaModule,
    SharedServicesModule,
    AuthModule,
    UsersModule,
    TalentModule,
    WorkExperienceModule,
    ProfileHighlightsModule,
    EmployerModule,
    JobsModule,
    TaxonomyModule,
    SalaryModule,
    ApplicationsModule,
    InvitationsModule,
    SavedModule,
    AdminModule,
    AlertsModule,
    BillingModule,
    UploadsModule,
    HealthModule,
  ],
})
export class AppModule {}
