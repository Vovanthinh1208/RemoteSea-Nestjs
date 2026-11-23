import { createJobReportSchema } from "./create-job-report.dto";

// PB88 AC2: the report form offers scam/MLM, illegal fee collection,
// discriminatory content, false information and other.
describe("createJobReportSchema (PB88)", () => {
  it.each(["SCAM", "ILLEGAL_FEE", "DISCRIMINATORY", "MISLEADING", "OTHER"])(
    "accepts the PB88 reason %s",
    (reason) => {
      expect(createJobReportSchema.safeParse({ reason }).success).toBe(true);
    },
  );

  it("keeps accepting legacy reasons so older clients and stored reports stay valid", () => {
    for (const reason of ["ALREADY_FILLED", "DUPLICATE"]) {
      expect(createJobReportSchema.safeParse({ reason }).success).toBe(true);
    }
  });

  it("rejects unknown reasons and over-long details", () => {
    expect(createJobReportSchema.safeParse({ reason: "FEE" }).success).toBe(
      false,
    );
    expect(
      createJobReportSchema.safeParse({
        reason: "OTHER",
        details: "x".repeat(2001),
      }).success,
    ).toBe(false);
  });
});
