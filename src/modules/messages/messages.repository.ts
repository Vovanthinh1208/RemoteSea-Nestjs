import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import { applicationPartiesSelect } from "@/common/interfaces/application-parties.interface";
import {
  messageSelect,
  type CreateMessageInput,
  type MessageListItem,
} from "./interfaces";
import { MESSAGES_RETURNED_CAP } from "./constants";

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateMessageInput): Promise<MessageListItem> {
    return this.prisma.message.create({
      data: {
        applicationId: input.applicationId,
        senderId: input.senderId,
        body: input.body,
      },
      select: messageSelect,
    });
  }

  // orderBy desc + take, then reverse — NOT orderBy asc + take, which would
  // return the thread's oldest MESSAGES_RETURNED_CAP messages forever once a
  // thread grows past the cap (new messages past #200 would never appear in
  // any future fetch for either party). This returns the most recent
  // MESSAGES_RETURNED_CAP, restored to chronological order for display.
  async listForApplication(applicationId: string): Promise<MessageListItem[]> {
    const messages = await this.prisma.message.findMany({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
      take: MESSAGES_RETURNED_CAP,
      select: messageSelect,
    });
    return messages.reverse();
  }

  // PB68 AC6: who to e-mail about a new message. Talent recipients follow
  // their employerMessages preference (no row = schema default, on); the
  // company side has no message-mail preference and is always e-mailed.
  async findRecipientContact(
    userId: string,
    isTalentRecipient: boolean,
  ): Promise<{ email: string; name: string | null } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        notificationPreference: { select: { employerMessages: true } },
      },
    });
    if (!user) return null;
    if (
      isTalentRecipient &&
      !(user.notificationPreference?.employerMessages ?? true)
    ) {
      return null;
    }
    return { email: user.email, name: user.name };
  }

  /** Self-contained narrow query (not a cross-import of ApplicationsRepository)
   * — same reasoning as InvitationsRepository.employerMessagesEnabled. Backs
   * TalentApplicationOwnershipGuard. */
  findApplicationForTalentOwnership(id: string) {
    return this.prisma.application.findUnique({
      where: { id },
      select: applicationPartiesSelect,
    });
  }
}
