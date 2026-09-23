import { NotificationsService } from "./notifications.service";
import type { NotificationsRepository } from "./notifications.repository";
import { NotFoundApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const makeService = (repoOverrides: Partial<NotificationsRepository> = {}) => {
  const repo = { ...repoOverrides } as unknown as NotificationsRepository;
  return { service: new NotificationsService(repo), repo };
};

describe("NotificationsService.create", () => {
  it("delegates straight to the repository", async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const { service } = makeService({ create });

    await service.create({
      userId: "user-1",
      type: "INVITATION_RECEIVED",
      title: "You were invited",
    });

    expect(create).toHaveBeenCalledWith({
      userId: "user-1",
      type: "INVITATION_RECEIVED",
      title: "You were invited",
    });
  });
});

describe("NotificationsService.listForUser", () => {
  it("paginates the caller's notifications and bundles the unread count", async () => {
    const listForUser = jest
      .fn()
      .mockResolvedValue([[{ id: "n1" }, { id: "n2" }], 2]);
    const unreadCount = jest.fn().mockResolvedValue(5);
    const { service } = makeService({ listForUser, unreadCount });

    const result = await service.listForUser("user-1", { page: 1, limit: 20 });

    expect(listForUser).toHaveBeenCalledWith("user-1", 0, 20);
    expect(unreadCount).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      notifications: [{ id: "n1" }, { id: "n2" }],
      unreadCount: 5,
      pagination: { page: 1, limit: 20, total: 2, pages: 1 },
    });
  });
});

describe("NotificationsService.markRead", () => {
  it("throws NOTIFICATION_NOT_FOUND when the row isn't owned by the caller or doesn't exist", async () => {
    const { service } = makeService({
      markRead: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .markRead("notif-1", "user-1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect((error as NotFoundApiException).getResponse()).toMatchObject({
      code: ErrorCode.NOTIFICATION_NOT_FOUND,
    });
  });

  it("returns the updated notification, and re-marking an already-read one still succeeds", async () => {
    const markRead = jest
      .fn()
      .mockResolvedValue({ id: "notif-1", readAt: new Date() });
    const { service } = makeService({ markRead });

    const result = await service.markRead("notif-1", "user-1");

    expect(markRead).toHaveBeenCalledWith("notif-1", "user-1");
    expect(result.id).toBe("notif-1");
  });
});

describe("NotificationsService.markAllRead", () => {
  it("returns the number of rows updated", async () => {
    const { service } = makeService({
      markAllRead: jest.fn().mockResolvedValue(4),
    });

    const result = await service.markAllRead("user-1");

    expect(result).toBe(4);
  });
});
