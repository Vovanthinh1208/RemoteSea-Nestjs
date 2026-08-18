import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import {
  notificationSelect,
  type CreateNotificationInput,
  type NotificationListItem,
} from "./interfaces";

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
      },
    });
  }

  async listForUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<[NotificationListItem[], number]> {
    const where = { userId };
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: notificationSelect,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return [notifications, total];
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  // No `readAt: null` guard on the write — re-marking an already-read
  // notification is a harmless idempotent timestamp bump, which keeps
  // count===0 an unambiguous "not yours or doesn't exist" (404), instead of
  // being conflated with "already read" (a no-op the caller shouldn't see
  // as an error).
  async markRead(
    id: string,
    userId: string,
  ): Promise<NotificationListItem | null> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (count === 0) return null;

    return this.prisma.notification.findUnique({
      where: { id },
      select: notificationSelect,
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }
}
