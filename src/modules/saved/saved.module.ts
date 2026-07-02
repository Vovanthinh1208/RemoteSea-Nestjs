import { Module } from "@nestjs/common";
import { SavedController } from "./saved.controller";
import { SavedService } from "./saved.service";
import { SavedRepository } from "./saved.repository";

@Module({
  controllers: [SavedController],
  providers: [SavedService, SavedRepository],
})
export class SavedModule {}
