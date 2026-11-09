import { offerDetailsSchema } from "./update-application.dto";

describe("PB56 offer start date", () => {
  const details = { salary: "USD 2000/month", benefits: "Health insurance" };
  it.each(["2026-02-29", "2026-02-31", "2026-04-31", "2026-13-01"])(
    "rejects nonexistent calendar date %s",
    (startDate) => {
      expect(
        offerDetailsSchema.safeParse({ ...details, startDate }).success,
      ).toBe(false);
    },
  );
  it.each(["2028-02-29", "2026-11-09"])("accepts %s", (startDate) => {
    expect(offerDetailsSchema.parse({ ...details, startDate }).startDate).toBe(
      startDate,
    );
  });
});
