import { Module } from "@nestjs/common";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { ApplicationsRepository } from "./applications.repository";

@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationsRepository],
})
export class ApplicationsModule {}
