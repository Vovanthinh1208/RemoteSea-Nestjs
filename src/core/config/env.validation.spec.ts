import { validateEnv } from "./env.validation";

const validBaseEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "a".repeat(32),
};

describe("validateEnv", () => {
  it("accepts a minimal valid config and fills in defaults", () => {
    const config = validateEnv(validBaseEnv);
    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(4000);
    expect(config.FRONTEND_URL).toBe("http://localhost:3000");
    expect(config.TRUST_PROXY_HOPS).toBe(1);
  });

  it("coerces TRUST_PROXY_HOPS from a string env var", () => {
    const config = validateEnv({ ...validBaseEnv, TRUST_PROXY_HOPS: "2" });
    expect(config.TRUST_PROXY_HOPS).toBe(2);
  });

  it("rejects a negative TRUST_PROXY_HOPS", () => {
    expect(() =>
      validateEnv({ ...validBaseEnv, TRUST_PROXY_HOPS: "-1" }),
    ).toThrow();
  });

  it("rejects a non-integer TRUST_PROXY_HOPS", () => {
    expect(() =>
      validateEnv({ ...validBaseEnv, TRUST_PROXY_HOPS: "1.5" }),
    ).toThrow();
  });

  it("rejects an AUTH_SECRET shorter than 32 characters", () => {
    expect(() =>
      validateEnv({ ...validBaseEnv, AUTH_SECRET: "too-short" }),
    ).toThrow();
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() =>
      validateEnv({ AUTH_SECRET: validBaseEnv.AUTH_SECRET }),
    ).toThrow();
  });

  it("requires a public HTTPS frontend origin in production", () => {
    expect(() =>
      validateEnv({ ...validBaseEnv, NODE_ENV: "production" }),
    ).toThrow("Production requires FRONTEND_URL");

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        NODE_ENV: "production",
        FRONTEND_URL: "https://remotesea-web.fly.dev/reset-password",
      }),
    ).toThrow("FRONTEND_URL must be an origin");

    expect(
      validateEnv({
        ...validBaseEnv,
        NODE_ENV: "production",
        FRONTEND_URL: "https://remotesea-web.fly.dev",
      }).FRONTEND_URL,
    ).toBe("https://remotesea-web.fly.dev");
  });

  it("leaves the pool knobs undefined when unset", () => {
    const config = validateEnv(validBaseEnv);
    expect(config.DATABASE_CONNECTION_LIMIT).toBeUndefined();
    expect(config.DATABASE_POOL_TIMEOUT).toBeUndefined();
  });

  it("coerces the pool knobs from string env vars", () => {
    const config = validateEnv({
      ...validBaseEnv,
      DATABASE_CONNECTION_LIMIT: "10",
      DATABASE_POOL_TIMEOUT: "20",
    });
    expect(config.DATABASE_CONNECTION_LIMIT).toBe(10);
    expect(config.DATABASE_POOL_TIMEOUT).toBe(20);
  });

  it("normalizes blank OAuth settings and rejects malformed callback URLs", () => {
    const config = validateEnv({
      ...validBaseEnv,
      AUTH_GOOGLE_ID: "   ",
      AUTH_GOOGLE_SECRET: "",
      AUTH_GOOGLE_CALLBACK_URL: "http://localhost:4000/auth/google/callback",
    });
    expect(config.AUTH_GOOGLE_ID).toBeUndefined();
    expect(config.AUTH_GOOGLE_SECRET).toBeUndefined();
    expect(config.AUTH_GOOGLE_CALLBACK_URL).toBe(
      "http://localhost:4000/auth/google/callback",
    );

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        AUTH_GOOGLE_CALLBACK_URL: "not-a-url",
      }),
    ).toThrow("Must be an absolute HTTP(S) URL");
  });

  it("rejects a zero or negative DATABASE_CONNECTION_LIMIT", () => {
    expect(() =>
      validateEnv({ ...validBaseEnv, DATABASE_CONNECTION_LIMIT: "0" }),
    ).toThrow();
  });

  it("coerces SMTP settings and allows an unconfigured local mail service", () => {
    const config = validateEnv({
      ...validBaseEnv,
      MAIL_HOST: "smtp.example.com",
      MAIL_PORT: "465",
      MAIL_SECURE: "true",
      MAIL_USER: "smtp-user",
      MAIL_PASSWORD: "smtp-password",
    });

    expect(config.MAIL_HOST).toBe("smtp.example.com");
    expect(config.MAIL_PORT).toBe(465);
    expect(config.MAIL_SECURE).toBe(true);
    expect(validateEnv(validBaseEnv).MAIL_HOST).toBeUndefined();
  });

  it("rejects partial SMTP credentials and credentials without a host", () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        MAIL_HOST: "smtp.example.com",
        MAIL_USER: "smtp-user",
      }),
    ).toThrow("MAIL_USER and MAIL_PASSWORD must be configured together");

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        MAIL_USER: "smtp-user",
        MAIL_PASSWORD: "secret",
      }),
    ).toThrow("MAIL_HOST is required when SMTP credentials are configured");
  });

  it("treats blank SMTP values from .env as unset", () => {
    const config = validateEnv({
      ...validBaseEnv,
      MAIL_HOST: "",
      MAIL_PORT: "",
      MAIL_SECURE: "",
      MAIL_USER: "",
      MAIL_PASSWORD: "",
      MAIL_FROM: "RemoteSEA <noreply@example.com>",
    });
    expect(config.MAIL_HOST).toBeUndefined();
    expect(config.MAIL_PORT).toBe(587);
    expect(config.MAIL_SECURE).toBeUndefined();
    expect(config.MAIL_FROM).toBe("RemoteSEA <noreply@example.com>");
  });

  it("rejects implicit TLS configuration on SMTP submission port 587", () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        MAIL_HOST: "smtp.example.com",
        MAIL_PORT: "587",
        MAIL_SECURE: "true",
      }),
    ).toThrow("Port 587 must use STARTTLS");
  });
});
