import { Module } from "@nestjs/common";
import { TalentController } from "./talent.controller";
import { TalentService } from "./talent.service";
import { TalentRepository } from "./talent.repository";

@Module({
  controllers: [TalentController],
  providers: [TalentService, TalentRepository],
  exports: [TalentService],
})
export class TalentModule {}
