import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const PREFIX = "enc:v1:";
const SALT = "remotesea:two-factor-secret:v1";

const encryptionKey = (): Buffer => {
  const keyMaterial =
    process.env.TWO_FACTOR_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!keyMaterial || keyMaterial.length < 32) {
    throw new Error("A 32-character 2FA encryption key is required");
  }
  return Buffer.from(hkdfSync("sha256", keyMaterial, SALT, "aes-256-gcm", 32));
};

export const isEncryptedTwoFactorSecret = (value: string): boolean =>
  value.startsWith(PREFIX);

export const encryptTwoFactorSecret = (secret: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
};

export const decryptTwoFactorSecret = (stored: string): string => {
  if (!isEncryptedTwoFactorSecret(stored)) return stored;
  const packed = Buffer.from(stored.slice(PREFIX.length), "base64");
  if (packed.length < 29) throw new Error("Invalid encrypted 2FA secret");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
};
