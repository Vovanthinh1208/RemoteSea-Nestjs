import { TalentRepository } from "./talent.repository";
import type { PrismaService } from "@/core/database/prisma.service";

describe("TalentRepository.consumeEmailVerification", () => {
  it("marks the token consumed, talent verified, and User.emailVerified in one transaction", async () => {
    const tx = {
      talentProfile: {
        findUnique: jest.fn().mockResolvedValue({ userId: "user-1" }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      talentEmailVerification: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new TalentRepository(prisma as unknown as PrismaService);

    await expect(
      repository.consumeEmailVerification("verification-1", "talent-1"),
    ).resolves.toBe(true);
    expect(tx.talentEmailVerification.updateMany).toHaveBeenCalledWith({
      where: { id: "verification-1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(tx.talentProfile.update).toHaveBeenCalledWith({
      where: { id: "talent-1" },
      data: {
        isVerified: true,
        verifiedAt: expect.any(Date),
        verificationStatus: "VERIFIED",
      },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { emailVerified: true },
    });
  });

  it("does not mark the account verified when the token was already consumed", async () => {
    const tx = {
      talentProfile: {
        findUnique: jest.fn().mockResolvedValue({ userId: "user-1" }),
        update: jest.fn(),
      },
      talentEmailVerification: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: { update: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new TalentRepository(prisma as unknown as PrismaService);

    await expect(
      repository.consumeEmailVerification("verification-1", "talent-1"),
    ).resolves.toBe(false);
    expect(tx.talentProfile.update).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
