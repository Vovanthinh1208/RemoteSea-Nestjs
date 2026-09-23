export const NotificationExample = {
  id: "cnot1a2b0000ug0h9x1n1a2",
  type: "APPLICATION_STATUS_CHANGED",
  title: "Your application status changed",
  body: "Your application for Senior Backend Engineer is now Shortlisted.",
  link: "/talent",
  readAt: null,
  createdAt: "2026-08-17T09:12:00.000Z",
};

export const NotificationsListExample = {
  notifications: [NotificationExample],
  unreadCount: 3,
  pagination: { page: 1, limit: 20, total: 1, pages: 1 },
};

export const UnreadCountExample = { count: 3 };

export const MarkAllNotificationsReadExample = { updated: 3 };

export const ValidationErrorExample = {
  error: "Validation failed",
  details: [{ path: "page", message: "Number must be greater than 0" }],
};
