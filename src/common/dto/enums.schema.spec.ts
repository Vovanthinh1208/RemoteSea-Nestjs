import { applicationStatusSchema } from "./enums.schema";
import { ALLOWED_TRANSITIONS } from "@/modules/employer/constants";

describe("Backlog application status compatibility", () => {
  it.each([
    ["PENDING", "APPLIED"],
    ["OFFER_ACCEPTED", "ACCEPTED"],
    ["OFFER_DECLINED", "DECLINED"],
    ["APPLIED", "APPLIED"],
    ["ACCEPTED", "ACCEPTED"],
    ["DECLINED", "DECLINED"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(applicationStatusSchema.parse(input)).toBe(expected);
  });

  it("preserves terminal states and rejects unknown statuses", () => {
    expect(ALLOWED_TRANSITIONS.ACCEPTED).toEqual([]);
    expect(ALLOWED_TRANSITIONS.DECLINED).toEqual([]);
    expect(applicationStatusSchema.safeParse("HIRED").success).toBe(false);
  });
});
