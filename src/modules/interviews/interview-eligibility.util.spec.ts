import { isInterviewComplete } from "./interview-eligibility.util";

describe("isInterviewComplete", () => {
  it("is false when there's no interview", () => {
    expect(isInterviewComplete(null)).toBe(false);
  });

  it("is false while still PENDING", () => {
    expect(
      isInterviewComplete({ status: "PENDING", confirmedSlot: null }),
    ).toBe(false);
  });

  it("is false when CONFIRMED but the slot hasn't happened yet", () => {
    expect(
      isInterviewComplete({
        status: "CONFIRMED",
        confirmedSlot: new Date(Date.now() + 60_000),
      }),
    ).toBe(false);
  });

  it("is true once CONFIRMED and the slot has passed", () => {
    expect(
      isInterviewComplete({
        status: "CONFIRMED",
        confirmedSlot: new Date(Date.now() - 60_000),
      }),
    ).toBe(true);
  });
});
