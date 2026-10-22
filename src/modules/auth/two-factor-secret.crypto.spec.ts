import {
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
  isEncryptedTwoFactorSecret,
} from "./two-factor-secret.crypto";

describe("two-factor secret encryption", () => {
  const previousKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  const previousAuthSecret = process.env.AUTH_SECRET;

  beforeAll(() => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY =
      "unit-test-only-key-material-at-least-32-chars";
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    else process.env.TWO_FACTOR_ENCRYPTION_KEY = previousKey;
    if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousAuthSecret;
  });

  it("encrypts secrets at rest and decrypts them for TOTP verification", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptTwoFactorSecret(secret);

    expect(isEncryptedTwoFactorSecret(encrypted)).toBe(true);
    expect(encrypted).not.toContain(secret);
    expect(decryptTwoFactorSecret(encrypted)).toBe(secret);
  });

  it("rejects ciphertext tampering", () => {
    const encrypted = encryptTwoFactorSecret("secret");
    const packed = Buffer.from(encrypted.slice("enc:v1:".length), "base64");
    packed[packed.length - 1] = (packed.at(-1) ?? 0) ^ 1;

    expect(() =>
      decryptTwoFactorSecret(`enc:v1:${packed.toString("base64")}`),
    ).toThrow();
  });
});
