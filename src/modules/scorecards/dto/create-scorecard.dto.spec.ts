import { createScorecardSchema } from "./create-scorecard.dto";

const valid = {
  technicalRating: 4,
  communicationRating: 3,
  cultureFitRating: 5,
  strengths: "Strong system design.",
  improvements: "Testing strategy.",
  recommendation: "NEUTRAL",
};

describe("createScorecardSchema (PB64 AC2–4)", () => {
  it("accepts every one of the five recommendations", () => {
    for (const recommendation of [
      "STRONGLY_RECOMMEND",
      "RECOMMEND",
      "NEUTRAL",
      "NOT_RECOMMEND",
      "STRONGLY_NOT_RECOMMEND",
    ]) {
      expect(
        createScorecardSchema.safeParse({ ...valid, recommendation }).success,
      ).toBe(true);
    }
  });

  it("rejects the old four-point values", () => {
    for (const recommendation of ["STRONG_YES", "YES", "NO", "STRONG_NO"]) {
      expect(
        createScorecardSchema.safeParse({ ...valid, recommendation }).success,
      ).toBe(false);
    }
  });

  it.each(["technicalRating", "communicationRating", "cultureFitRating"])(
    "scores %s on 1–5 only",
    (field) => {
      for (const [value, ok] of [
        [0, false],
        [1, true],
        [5, true],
        [6, false],
        [3.5, false],
      ] as const) {
        expect(
          createScorecardSchema.safeParse({ ...valid, [field]: value }).success,
        ).toBe(ok);
      }
    },
  );

  it.each(["strengths", "improvements"])("requires %s", (field) => {
    expect(
      createScorecardSchema.safeParse({ ...valid, [field]: "  " }).success,
    ).toBe(false);
    const { [field as keyof typeof valid]: _omitted, ...rest } = valid;
    expect(createScorecardSchema.safeParse(rest).success).toBe(false);
  });
});
