import { isEligibleForAutoApproval } from "./job-verification.util";

const baseJob = {
  description: "x".repeat(100),
  salaryMin: 1000,
  categoryCount: 1,
};

describe("isEligibleForAutoApproval", () => {
  it("passes when the employer is verified and all 4 criteria are met", () => {
    expect(isEligibleForAutoApproval(baseJob, true)).toBe(true);
  });

  it("fails when the employer is not verified", () => {
    expect(isEligibleForAutoApproval(baseJob, false)).toBe(false);
  });

  it("fails when the description is too short", () => {
    expect(
      isEligibleForAutoApproval({ ...baseJob, description: "too short" }, true),
    ).toBe(false);
  });

  it("fails when salaryMin is null", () => {
    expect(
      isEligibleForAutoApproval({ ...baseJob, salaryMin: null }, true),
    ).toBe(false);
  });

  it("fails when there are no categories", () => {
    expect(
      isEligibleForAutoApproval({ ...baseJob, categoryCount: 0 }, true),
    ).toBe(false);
  });
});
