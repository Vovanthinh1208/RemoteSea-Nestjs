import { UsersRepository } from "./users.repository";
import type { PrismaService } from "@/core/database/prisma.service";

describe("UsersRepository.listConnections", () => {
  it("returns each linked provider with its creation time in link order", async () => {
    const createdAt = new Date("2026-10-20T09:30:00.000Z");
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { provider: "google", providerAccountId: "google-1", createdAt },
      ]);
    const repository = new UsersRepository({
      account: { findMany },
    } as unknown as PrismaService);

    await expect(repository.listConnections("user-1")).resolves.toEqual([
      { provider: "google", providerAccountId: "google-1", createdAt },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { provider: true, providerAccountId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("UsersRepository.disconnectConnectionSafely", () => {
  it("locks the user before checking sign-in methods and deleting the provider", async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn().mockImplementation(async () => {
        calls.push("lock");
        return [{ id: "user-1" }];
      }),
      user: {
        findUnique: jest.fn().mockImplementation(async () => {
          calls.push("count-methods");
          return { passwordHash: null, _count: { accounts: 2 } };
        }),
      },
      account: {
        deleteMany: jest.fn().mockImplementation(async () => {
          calls.push("delete-provider");
          return { count: 1 };
        }),
      },
    };
    const transaction = jest.fn((callback) => callback(tx));
    const repository = new UsersRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      repository.disconnectConnectionSafely("user-1", "google"),
    ).resolves.toBe("disconnected");
    expect(calls).toEqual(["lock", "count-methods", "delete-provider"]);
    expect(tx.account.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "google" },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("keeps the last password-less OAuth method when disconnecting", async () => {
    const deleteMany = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "user-1" }]),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ passwordHash: null, _count: { accounts: 1 } }),
      },
      account: { deleteMany },
    };
    const repository = new UsersRepository({
      $transaction: jest.fn((callback) => callback(tx)),
    } as unknown as PrismaService);

    await expect(
      repository.disconnectConnectionSafely("user-1", "google"),
    ).resolves.toBe("last_sign_in_method");
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("reports missing owners and missing provider links without deleting", async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findUnique: jest.fn() },
      account: { deleteMany },
    };
    const repository = new UsersRepository({
      $transaction: jest.fn((callback) => callback(tx)),
    } as unknown as PrismaService);

    await expect(
      repository.disconnectConnectionSafely("missing-user", "google"),
    ).resolves.toBe("user_not_found");
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();

    tx.$queryRaw.mockResolvedValue([{ id: "user-1" }]);
    tx.user.findUnique.mockResolvedValue({
      passwordHash: "password-hash",
      _count: { accounts: 0 },
    });
    await expect(
      repository.disconnectConnectionSafely("user-1", "google"),
    ).resolves.toBe("connection_not_found");
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });
});

describe("UsersRepository.findExportData", () => {
  it("exports user-editable account data without credentials or 2FA secrets", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const repository = new UsersRepository({
      user: { findUnique },
    } as unknown as PrismaService);

    await repository.findExportData("user-1");

    const { select } = findUnique.mock.calls[0][0];
    expect(select).toMatchObject({
      email: true,
      name: true,
      image: true,
      emailVerified: true,
      phone: true,
      language: true,
      region: true,
      currencyDisplay: true,
      role: true,
      isPaused: true,
      pausedAt: true,
      createdAt: true,
      updatedAt: true,
      talent: expect.any(Object),
      employer: expect.any(Object),
      jobAlerts: true,
      notificationPreference: true,
      messages: expect.any(Object),
    });
    expect(select).not.toHaveProperty("passwordHash");
    expect(select).not.toHaveProperty("twoFactorSecret");
    expect(select).not.toHaveProperty("twoFactorBackupCodes");
  });
});

describe("UsersRepository.getNotificationPreferences", () => {
  it("uses an upsert for race-safe lazy initialization", async () => {
    const upsert = jest.fn().mockResolvedValue({ userId: "user-1" });
    const repository = new UsersRepository({
      notificationPreference: { upsert },
    } as unknown as PrismaService);

    await repository.getNotificationPreferences("user-1");

    expect(upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1" },
      update: {},
    });
  });
});

describe("UsersRepository.setPausedAndRevokeSessions", () => {
  it("updates account state and revokes active sessions in one transaction", async () => {
    const calls: string[] = [];
    const tx = {
      user: {
        update: jest.fn().mockImplementation(async () => {
          calls.push("pause-user");
          return { id: "user-1", isPaused: true, pausedAt: new Date() };
        }),
      },
      session: {
        updateMany: jest.fn().mockImplementation(async () => {
          calls.push("revoke-sessions");
          return { count: 2 };
        }),
      },
    };
    const transaction = jest.fn((callback) => callback(tx));
    const repository = new UsersRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    await repository.setPausedAndRevokeSessions("user-1");

    expect(calls).toEqual(["pause-user", "revoke-sessions"]);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { isPaused: true, pausedAt: expect.any(Date) },
      select: { id: true, isPaused: true, pausedAt: true },
    });
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe("UsersRepository.deleteUser", () => {
  it("deletes the user and their email-keyed reset tokens in one transaction", async () => {
    const tx = {
      user: {
        delete: jest
          .fn()
          .mockResolvedValue({ id: "user-1", email: "gone@example.com" }),
      },
      verificationToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const transaction = jest.fn((callback) => callback(tx));
    const repository = new UsersRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(repository.deleteUser("user-1")).resolves.toMatchObject({
      id: "user-1",
    });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(tx.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "gone@example.com" },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("leaves reset tokens alone when the user delete itself fails", async () => {
    const tx = {
      user: { delete: jest.fn().mockRejectedValue(new Error("FK restrict")) },
      verificationToken: { deleteMany: jest.fn() },
    };
    const repository = new UsersRepository({
      $transaction: jest.fn((callback) => callback(tx)),
    } as unknown as PrismaService);

    await expect(repository.deleteUser("user-1")).rejects.toThrow(
      "FK restrict",
    );
    expect(tx.verificationToken.deleteMany).not.toHaveBeenCalled();
  });
});
