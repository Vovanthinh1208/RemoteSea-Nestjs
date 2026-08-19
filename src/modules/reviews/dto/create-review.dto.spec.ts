import { createReviewSchema } from "./create-review.dto";

const validPayload = {
  applicationId: "capp1a2b0000ug0h9x1n1a2",
  overallRating: 5,
};

describe("createReviewSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(createReviewSchema.safeParse(validPayload).success).toBe(true);
  });

  it("accepts every rating field at the 1 and 5 boundaries", () => {
    const result = createReviewSchema.safeParse({
      ...validPayload,
      overallRating: 1,
      communicationRating: 5,
      professionalismRating: 1,
      interviewProcessRating: 5,
      comment: "Solid experience overall.",
    });
    expect(result.success).toBe(true);
  });

  it.each([0, -1, 6, 10])(
    "rejects an overallRating of %d (outside 1-5)",
    (rating) => {
      const result = createReviewSchema.safeParse({
        ...validPayload,
        overallRating: rating,
      });
      expect(result.success).toBe(false);
    },
  );

  it("rejects a non-integer rating", () => {
    expect(
      createReviewSchema.safeParse({ ...validPayload, overallRating: 4.5 })
        .success,
    ).toBe(false);
  });

  it("rejects a category rating outside 1-5, independent of overallRating", () => {
    const result = createReviewSchema.safeParse({
      ...validPayload,
      communicationRating: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty comment string (present but blank)", () => {
    expect(
      createReviewSchema.safeParse({ ...validPayload, comment: "" }).success,
    ).toBe(false);
    expect(
      createReviewSchema.safeParse({ ...validPayload, comment: "   " }).success,
    ).toBe(false);
  });

  it("allows an omitted comment", () => {
    const result = createReviewSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.comment).toBeUndefined();
  });

  it("trims a comment with surrounding whitespace", () => {
    const result = createReviewSchema.safeParse({
      ...validPayload,
      comment: "  Great experience.  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.comment).toBe("Great experience.");
  });

  it("rejects a comment over the max length", () => {
    const result = createReviewSchema.safeParse({
      ...validPayload,
      comment: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing applicationId or overallRating", () => {
    expect(createReviewSchema.safeParse({ overallRating: 5 }).success).toBe(
      false,
    );
    expect(
      createReviewSchema.safeParse({
        applicationId: validPayload.applicationId,
      }).success,
    ).toBe(false);
  });

  // Section 17/21's core manipulation concern: a caller cannot smuggle a
  // revieweeId (or any other server-derived field) through the request body
  // — zod's default "strip unknown keys" behavior means it's silently
  // dropped before ever reaching the service, not merely ignored downstream.
  it("strips a client-supplied revieweeId instead of trusting it", () => {
    const result = createReviewSchema.safeParse({
      ...validPayload,
      revieweeId: "someone-elses-user-id",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("revieweeId");
    }
  });
});
