import { trimmedString } from "./trimmed-string.schema";

describe("trimmedString", () => {
  it("trims leading and trailing whitespace from a valid value", () => {
    const schema = trimmedString({ min: 3, max: 20 });
    expect(schema.parse("  Senior Engineer  ")).toBe("Senior Engineer");
  });

  it("enforces min length on the trimmed value, not the padded one", () => {
    const schema = trimmedString({ min: 5, max: 20 });
    // "ab" alone is only 2 characters — padding it out to 5 characters of
    // whitespace must not be enough to pass a min(5) meant for real content.
    expect(() => schema.parse("   ab")).toThrow();
  });

  it("rejects a value that's whitespace only when min is set", () => {
    const schema = trimmedString({ min: 1, max: 20 });
    expect(() => schema.parse("     ")).toThrow();
  });

  it("enforces max length on the trimmed value", () => {
    const schema = trimmedString({ max: 5 });
    expect(() => schema.parse("  123456  ")).toThrow();
    expect(schema.parse("  123  ")).toBe("123");
  });

  it("has no minimum when min is omitted — trimming to empty is allowed", () => {
    const schema = trimmedString({ max: 20 });
    expect(schema.parse("   ")).toBe("");
  });
});
