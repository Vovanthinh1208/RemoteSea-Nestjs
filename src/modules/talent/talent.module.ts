import { Module } from "@nestjs/common";
import { TalentController } from "./talent.controller";
import { TalentService } from "./talent.service";
import { TalentRepository } from "./talent.repository";
import { UploadsModule } from "@/modules/uploads/uploads.module";
import { AuthModule } from "@/modules/auth/auth.module";

@Module({
  imports: [UploadsModule, AuthModule],
  controllers: [TalentController],
  providers: [TalentService, TalentRepository],
})
export class TalentModule {}
