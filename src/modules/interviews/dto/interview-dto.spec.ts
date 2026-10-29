import { proposeInterviewSchema } from "./propose-interview.dto";
import { cancelInterviewSchema } from "./cancel-interview.dto";

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

const valid = {
  title: "Vòng 1 - Kỹ thuật",
  platform: "GOOGLE_MEET",
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  durationMinutes: 45,
  proposedSlots: [inAnHour()],
};

describe("proposeInterviewSchema (PB60 AC2–3, BR1)", () => {
  it("accepts a complete proposal", () => {
    expect(proposeInterviewSchema.safeParse(valid).success).toBe(true);
  });

  it.each(["title", "platform", "meetingUrl"] as const)(
    "requires %s",
    (field) => {
      const { [field]: _omitted, ...rest } = valid;
      expect(proposeInterviewSchema.safeParse(rest).success).toBe(false);
    },
  );

  it("rejects an unknown platform and a non-http(s) link", () => {
    expect(
      proposeInterviewSchema.safeParse({ ...valid, platform: "SKYPE" }).success,
    ).toBe(false);
    expect(
      proposeInterviewSchema.safeParse({
        ...valid,
        meetingUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("accepts 1 or 2 slots, never 0 or 3", () => {
    const slot = inAnHour();
    for (const [slots, ok] of [
      [[], false],
      [[slot], true],
      [[slot, slot], true],
      [[slot, slot, slot], false],
    ] as const) {
      expect(
        proposeInterviewSchema.safeParse({ ...valid, proposedSlots: slots })
          .success,
      ).toBe(ok);
    }
  });
});

describe("cancelInterviewSchema (PB62 BR1)", () => {
  it("requires a reason", () => {
    expect(cancelInterviewSchema.safeParse({}).success).toBe(false);
    expect(cancelInterviewSchema.safeParse({ reason: "    " }).success).toBe(
      false,
    );
  });

  it("accepts a real reason and trims it", () => {
    const result = cancelInterviewSchema.safeParse({
      reason: "  The interviewer is ill.  ",
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.reason).toBe("The interviewer is ill.");
  });
});
