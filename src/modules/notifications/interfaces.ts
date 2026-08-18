import type { NotificationType, Prisma } from "@prisma/client";

export const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationListItem = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
};
