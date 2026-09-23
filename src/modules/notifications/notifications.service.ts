import { Injectable } from "@nestjs/common";
import { NotificationsRepository } from "./notifications.repository";
import type { CreateNotificationInput } from "./interfaces";
import type { ListNotificationsDto } from "./dto/list-notifications.dto";
import { assertFound } from "@/common/utils/assert-found";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import { ErrorCode } from "@/common/exceptions/error-codes";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  create(input: CreateNotificationInput): Promise<void> {
    return this.notificationsRepository.create(input);
  }

  async listForUser(userId: string, query: ListNotificationsDto) {
    const { page, limit } = query;
    const skip = paginationSkip(page, limit);
    // unreadCount rides along with the list so the header badge never needs
    // its own round trip — GET /notifications/unread-count still exists for
    // callers (e.g. a poll) that only want the count.
    const [[notifications, total], unreadCount] = await Promise.all([
      this.notificationsRepository.listForUser(userId, skip, limit),
      this.notificationsRepository.unreadCount(userId),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: buildPagination(page, limit, total),
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.notificationsRepository.unreadCount(userId);
  }

  async markRead(id: string, userId: string) {
    const updated = await this.notificationsRepository.markRead(id, userId);
    assertFound(
      updated,
      "Notification not found",
      ErrorCode.NOTIFICATION_NOT_FOUND,
    );
    return updated;
  }

  markAllRead(userId: string): Promise<number> {
    return this.notificationsRepository.markAllRead(userId);
  }
}
