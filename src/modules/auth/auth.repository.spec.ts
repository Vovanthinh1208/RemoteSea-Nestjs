import { AuthRepository } from "./auth.repository";
import type { PrismaService } from "@/core/database/prisma.service";
import { decryptTwoFactorSecret } from "./two-factor-secret.crypto";

describe("AuthRepository 2FA secret storage", () => {
  const previousKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let repository: AuthRepository;

  beforeAll(() => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY =
      "repository-test-key-material-at-least-32-chars";
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    else process.env.TWO_FACTOR_ENCRYPTION_KEY = previousKey;
  });

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    repository = new AuthRepository(prisma as unknown as PrismaService);
  });

  it("stores newly configured TOTP secrets only as encrypted values", async () => {
    await repository.setTwoFactorSecret("u1", "JBSWY3DPEHPK3PXP");
    const stored = prisma.user.update.mock.calls[0][0].data.twoFactorSecret;

    expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptTwoFactorSecret(stored)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("decrypts encrypted values returned to the TOTP verifier", async () => {
    // Exercise the real encrypted path using the repository write result.
    await repository.setTwoFactorSecret("u1", "JBSWY3DPEHPK3PXP");
    const encrypted = prisma.user.update.mock.calls[0][0].data.twoFactorSecret;
    prisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: false,
      twoFactorSecret: encrypted,
      twoFactorBackupCodes: [],
    });

    const result = await repository.findTwoFactorState("u1");
    expect(result?.twoFactorSecret).toBe("JBSWY3DPEHPK3PXP");
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("re-encrypts legacy plaintext values on first read", async () => {
    prisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: "LEGACY-TOTP-SECRET",
      twoFactorBackupCodes: [],
    });

    const result = await repository.findTwoFactorState("u1");
    const migrated = prisma.user.updateMany.mock.calls[0][0];
    expect(result?.twoFactorSecret).toBe("LEGACY-TOTP-SECRET");
    expect(migrated.where).toEqual({
      id: "u1",
      twoFactorSecret: "LEGACY-TOTP-SECRET",
    });
    expect(decryptTwoFactorSecret(migrated.data.twoFactorSecret)).toBe(
      "LEGACY-TOTP-SECRET",
    );
  });
});
