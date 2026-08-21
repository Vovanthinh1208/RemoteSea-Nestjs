import { parseCvAnalysisResponse } from "./cv-analysis-response.parser";

const VALID_RESPONSE = JSON.stringify({
  fitScore: 78,
  summary: "Strong backend generalist, no direct GraphQL experience.",
  strengths: ["5 years Node.js", "Led a team of 3"],
  gaps: ["No GraphQL experience listed"],
  suggestedQuestions: ["Have you worked with GraphQL before?"],
});

describe("parseCvAnalysisResponse", () => {
  it("parses a well-formed response", () => {
    const result = parseCvAnalysisResponse(VALID_RESPONSE);
    expect(result).toEqual({
      fitScore: 78,
      summary: "Strong backend generalist, no direct GraphQL experience.",
      strengths: ["5 years Node.js", "Led a team of 3"],
      gaps: ["No GraphQL experience listed"],
      suggestedQuestions: ["Have you worked with GraphQL before?"],
    });
  });

  it("extracts JSON even when the model wraps it in prose or a code fence", () => {
    const wrapped = `Here you go:\n\`\`\`json\n${VALID_RESPONSE}\n\`\`\``;
    expect(parseCvAnalysisResponse(wrapped)?.fitScore).toBe(78);
  });

  it("rounds a non-integer fitScore", () => {
    const raw = JSON.stringify({
      fitScore: 77.6,
      summary: "s",
      strengths: [],
      gaps: [],
      suggestedQuestions: [],
    });
    expect(parseCvAnalysisResponse(raw)?.fitScore).toBe(78);
  });

  it("clamps a fitScore the model reported outside 0-100", () => {
    const raw = JSON.stringify({
      fitScore: 140,
      summary: "s",
      strengths: [],
      gaps: [],
      suggestedQuestions: [],
    });
    expect(parseCvAnalysisResponse(raw)?.fitScore).toBe(100);
  });

  it("rejects a response with more items than the prompt's stated cap", () => {
    const raw = JSON.stringify({
      fitScore: 50,
      summary: "s",
      strengths: ["a", "b", "c", "d", "e"],
      gaps: [],
      suggestedQuestions: [],
    });
    expect(parseCvAnalysisResponse(raw)).toBeNull();
  });

  it("returns null for a response missing required fields", () => {
    const raw = JSON.stringify({ fitScore: 50, summary: "s" });
    expect(parseCvAnalysisResponse(raw)).toBeNull();
  });

  it("returns null for non-JSON text", () => {
    expect(
      parseCvAnalysisResponse("I couldn't analyze this resume."),
    ).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseCvAnalysisResponse("{fitScore: 50, summary: }")).toBeNull();
  });
});
