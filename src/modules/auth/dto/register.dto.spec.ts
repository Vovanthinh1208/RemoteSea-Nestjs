import { registerSchema } from "./register.dto";

const valid = {
  name: "Ann",
  email: "ann@example.com",
  password: "Passw0rd!234",
  role: "TALENT",
};

describe("registerSchema (PB01)", () => {
  it("accepts a name of at least 2 characters", () => {
    expect(registerSchema.safeParse({ ...valid, name: "Al" }).success).toBe(
      true,
    );
  });

  it("rejects a 1-character name and a name that is 1 character after trimming", () => {
    expect(registerSchema.safeParse({ ...valid, name: "A" }).success).toBe(
      false,
    );
    expect(registerSchema.safeParse({ ...valid, name: "  A  " }).success).toBe(
      false,
    );
  });

  it("never allows self-registration as ADMIN", () => {
    expect(registerSchema.safeParse({ ...valid, role: "ADMIN" }).success).toBe(
      false,
    );
  });
});
