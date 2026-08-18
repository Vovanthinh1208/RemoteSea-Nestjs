import { Module } from "@nestjs/common";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { MessagesRepository } from "./messages.repository";
import { TalentApplicationOwnershipGuard } from "./guards/talent-application-ownership.guard";

@Module({
  controllers: [MessagesController],
  providers: [
    MessagesService,
    MessagesRepository,
    TalentApplicationOwnershipGuard,
  ],
  // EmployerModule calls MessagesService.list/send for the employer-side
  // applications/:id/messages routes — see employer.service.ts.
  exports: [MessagesService],
})
export class MessagesModule {}
