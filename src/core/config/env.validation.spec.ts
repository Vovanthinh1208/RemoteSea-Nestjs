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
});
