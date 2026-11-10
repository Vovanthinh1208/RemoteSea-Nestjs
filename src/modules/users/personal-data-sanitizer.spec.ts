import {
  isForbiddenKey,
  sanitizePersonalData,
} from "./personal-data-sanitizer";

describe("personal-data-sanitizer (PB17 - AC06)", () => {
  describe("isForbiddenKey", () => {
    it("identifies sensitive authentication and secret keys", () => {
      expect(isForbiddenKey("password")).toBe(true);
      expect(isForbiddenKey("passwordHash")).toBe(true);
      expect(isForbiddenKey("hashedPassword")).toBe(true);
      expect(isForbiddenKey("twoFactorSecret")).toBe(true);
      expect(isForbiddenKey("otpSecret")).toBe(true);
      expect(isForbiddenKey("recoveryCodes")).toBe(true);
      expect(isForbiddenKey("accessToken")).toBe(true);
      expect(isForbiddenKey("refreshToken")).toBe(true);
      expect(isForbiddenKey("resetToken")).toBe(true);
      expect(isForbiddenKey("apiKey")).toBe(true);
      expect(isForbiddenKey("privateKey")).toBe(true);
      expect(isForbiddenKey("sessionSecret")).toBe(true);
    });

    it("allows non-sensitive business fields", () => {
      expect(isForbiddenKey("id")).toBe(false);
      expect(isForbiddenKey("email")).toBe(false);
      expect(isForbiddenKey("name")).toBe(false);
      expect(isForbiddenKey("role")).toBe(false);
      expect(isForbiddenKey("headline")).toBe(false);
      expect(isForbiddenKey("skills")).toBe(false);
      expect(isForbiddenKey("applications")).toBe(false);
      expect(isForbiddenKey("messages")).toBe(false);
    });
  });

  describe("sanitizePersonalData", () => {
    it("strips top-level sensitive fields", () => {
      const input = {
        id: "usr_123",
        email: "user@example.com",
        passwordHash: "$2b$10$xyz...",
        twoFactorSecret: "BASE32SECRET",
        twoFactorBackupCodes: ["code1", "code2"],
      };

      const result = sanitizePersonalData(input);
      expect(result).toEqual({
        id: "usr_123",
        email: "user@example.com",
      });
      expect(result).not.toHaveProperty("passwordHash");
      expect(result).not.toHaveProperty("twoFactorSecret");
      expect(result).not.toHaveProperty("twoFactorBackupCodes");
    });

    it("strips nested sensitive fields in arrays and objects", () => {
      const input = {
        user: {
          id: "usr_123",
          auth: {
            accessToken: "secret_access",
            refreshToken: "secret_refresh",
            validUntil: "2026-12-31",
          },
          sessions: [
            { id: "s1", sessionToken: "secret_session", device: "MacBook" },
            { id: "s2", sessionToken: "secret_session2", device: "iPhone" },
          ],
        },
      };

      const result = sanitizePersonalData(input) as any;
      expect(result.user.id).toBe("usr_123");
      expect(result.user.auth).toEqual({ validUntil: "2026-12-31" });
      expect(result.user.sessions).toEqual([
        { id: "s1", device: "MacBook" },
        { id: "s2", device: "iPhone" },
      ]);
    });

    it("preserves null, undefined, dates, and primitives", () => {
      const now = new Date();
      const input = {
        name: "Test",
        age: 30,
        isActive: true,
        date: now,
        empty: null,
        missing: undefined,
      };

      const result = sanitizePersonalData(input);
      expect(result).toEqual(input);
    });
  });
});
