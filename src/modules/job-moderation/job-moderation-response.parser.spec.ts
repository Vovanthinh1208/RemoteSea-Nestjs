import { parseJobModerationResponse } from "./job-moderation-response.parser";

const VALID_RESPONSE = JSON.stringify({
  riskLevel: "MEDIUM",
  reasons: ["Pay is well above market for the stated seniority"],
  summary: "Mostly legitimate, but the salary range is worth a second look.",
});

describe("parseJobModerationResponse", () => {
  it("parses a well-formed response", () => {
    expect(parseJobModerationResponse(VALID_RESPONSE)).toEqual({
      riskLevel: "MEDIUM",
      reasons: ["Pay is well above market for the stated seniority"],
      summary:
        "Mostly legitimate, but the salary range is worth a second look.",
    });
  });

  it("extracts JSON even when the model wraps it in prose or a code fence", () => {
    const wrapped = `Here you go:\n\`\`\`json\n${VALID_RESPONSE}\n\`\`\``;
    expect(parseJobModerationResponse(wrapped)?.riskLevel).toBe("MEDIUM");
  });

  it("accepts an empty reasons array (the LOW-risk, nothing-stood-out case)", () => {
    const raw = JSON.stringify({
      riskLevel: "LOW",
      reasons: [],
      summary: "Reads as a normal, legitimate posting.",
    });
    expect(parseJobModerationResponse(raw)).toEqual({
      riskLevel: "LOW",
      reasons: [],
      summary: "Reads as a normal, legitimate posting.",
    });
  });

  it("rejects a riskLevel outside the enum", () => {
    const raw = JSON.stringify({
      riskLevel: "CRITICAL",
      reasons: [],
      summary: "s",
    });
    expect(parseJobModerationResponse(raw)).toBeNull();
  });

  it("rejects a response with more reasons than the prompt's stated cap", () => {
    const raw = JSON.stringify({
      riskLevel: "HIGH",
      reasons: ["a", "b", "c", "d", "e", "f"],
      summary: "s",
    });
    expect(parseJobModerationResponse(raw)).toBeNull();
  });

  it("returns null for a response missing required fields", () => {
    const raw = JSON.stringify({ riskLevel: "LOW" });
    expect(parseJobModerationResponse(raw)).toBeNull();
  });

  it("returns null for non-JSON text", () => {
    expect(
      parseJobModerationResponse("I can't assess this posting."),
    ).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(
      parseJobModerationResponse("{riskLevel: LOW, summary: }"),
    ).toBeNull();
  });
});
