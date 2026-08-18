import { Injectable, Logger } from "@nestjs/common";
import { MessagesRepository } from "./messages.repository";
import type {
  ApplicationParties,
  MessageListItem,
  ThreadWithHeader,
} from "./interfaces";
import type { SendMessageDto } from "./dto/send-message.dto";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { runInBackground } from "@/common/utils/background-task.util";

const NOTIFICATION_PREVIEW_LENGTH = 100;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Bundles thread + header context in one response — parties is already
  // loaded by the caller's ownership guard for the auth check, so this adds
  // zero extra queries and lets the frontend skip a separate lookup just to
  // render "chatting with X about Y" (see ApplicationParties's comment).
  async list(parties: ApplicationParties): Promise<ThreadWithHeader> {
    const messages = await this.messagesRepository.listForApplication(
      parties.id,
    );
    return {
      messages,
      jobTitle: parties.job.title,
      employerName: parties.job.employer.companyName,
      talentName: parties.talent.user.name,
    };
  }

  async send(
    parties: ApplicationParties,
    senderId: string,
    dto: SendMessageDto,
  ): Promise<MessageListItem> {
    const message = await this.messagesRepository.create({
      applicationId: parties.id,
      senderId,
      body: dto.body,
    });

    const recipientId =
      senderId === parties.talent.userId
        ? parties.job.employer.userId
        : parties.talent.userId;

    const preview =
      dto.body.length > NOTIFICATION_PREVIEW_LENGTH
        ? `${dto.body.slice(0, NOTIFICATION_PREVIEW_LENGTH)}…`
        : dto.body;

    runInBackground(
      this.notificationsService.create({
        userId: recipientId,
        type: "MESSAGE_RECEIVED",
        title: `New message about ${parties.job.title}`,
        body: preview,
        link: `/applications/${parties.id}/messages`,
      }),
      this.logger,
      `Failed to create message notification for application ${parties.id}`,
    );

    return message;
  }
}
