import { timingSafeEqualString } from "./timing-safe-equal.util";

describe("timingSafeEqualString", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqualString("Bearer secret123", "Bearer secret123")).toBe(
      true,
    );
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqualString("Bearer secret123", "Bearer secret456")).toBe(
      false,
    );
  });

  it("returns false for strings of different lengths, without throwing", () => {
    expect(timingSafeEqualString("short", "a much longer string")).toBe(false);
  });

  it("returns false when compared against an empty string", () => {
    expect(timingSafeEqualString("secret", "")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(timingSafeEqualString("", "")).toBe(true);
  });
});
