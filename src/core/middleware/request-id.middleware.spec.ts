import { resolveRequestId } from "./request-id.middleware";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("resolveRequestId", () => {
  it("reuses a well-formed inbound id", () => {
    expect(resolveRequestId("abc-123_XYZ")).toBe("abc-123_XYZ");
  });

  it("takes the first value when the header repeats", () => {
    expect(resolveRequestId(["first-id", "second-id"])).toBe("first-id");
  });

  it("mints a UUID when the header is absent", () => {
    expect(resolveRequestId(undefined)).toMatch(UUID_PATTERN);
  });

  it("mints a UUID instead of propagating a value with control characters", () => {
    expect(resolveRequestId("id\nX-Forged-Header: evil")).toMatch(UUID_PATTERN);
  });

  it("mints a UUID instead of propagating an oversized value", () => {
    expect(resolveRequestId("a".repeat(101))).toMatch(UUID_PATTERN);
  });

  it("mints a UUID for an empty string", () => {
    expect(resolveRequestId("")).toMatch(UUID_PATTERN);
  });
});
