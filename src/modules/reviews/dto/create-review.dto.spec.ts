import { createReviewSchema } from "./create-review.dto";

// PB71 AC3: title + a comment of at least 20 characters are required.
const validPayload = {
  applicationId: "capp1a2b0000ug0h9x1n1a2",
  overallRating: 5,
  title: "Smooth process",
  comment: "Clear communication at every step.",
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
      comment: "Solid experience overall, would recommend.",
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

  // Previously "allows an omitted comment" — PB71 AC3 makes the detailed
  // comment (and a title) mandatory.
  it("rejects an omitted comment or title", () => {
    const { comment: _comment, ...noComment } = validPayload;
    const { title: _title, ...noTitle } = validPayload;
    expect(createReviewSchema.safeParse(noComment).success).toBe(false);
    expect(createReviewSchema.safeParse(noTitle).success).toBe(false);
  });

  it("requires at least 20 characters of comment after trimming", () => {
    expect(
      createReviewSchema.safeParse({
        ...validPayload,
        comment: "a".repeat(19),
      }).success,
    ).toBe(false);
    expect(
      createReviewSchema.safeParse({
        ...validPayload,
        comment: `  ${"a".repeat(19)}   `,
      }).success,
    ).toBe(false);
    expect(
      createReviewSchema.safeParse({
        ...validPayload,
        comment: "a".repeat(20),
      }).success,
    ).toBe(true);
  });

  it("rejects a blank title", () => {
    expect(
      createReviewSchema.safeParse({ ...validPayload, title: "   " }).success,
    ).toBe(false);
  });

  it("trims a comment with surrounding whitespace", () => {
    const result = createReviewSchema.safeParse({
      ...validPayload,
      comment: "  Great experience overall.  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comment).toBe("Great experience overall.");
    }
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
