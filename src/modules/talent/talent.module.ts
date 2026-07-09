import { Module } from "@nestjs/common";
import { TalentController } from "./talent.controller";
import { TalentService } from "./talent.service";
import { TalentRepository } from "./talent.repository";
import { UploadsModule } from "@/modules/uploads/uploads.module";

@Module({
  imports: [UploadsModule],
  controllers: [TalentController],
  providers: [TalentService, TalentRepository],
})
export class TalentModule {}
