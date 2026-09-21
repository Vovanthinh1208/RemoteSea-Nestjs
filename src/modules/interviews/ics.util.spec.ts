import { buildInterviewIcs, type InterviewIcsInput } from "./ics.util";

// RFC 5545 unfolding: a CRLF immediately followed by exactly one space is a
// fold point, not a real line break — collapsing it back out lets these
// tests assert on a property's full logical value without caring where the
// 75-octet fold boundary happened to land.
const unfold = (ics: string): string => ics.replace(/\r\n /g, "");

const baseInput: InterviewIcsInput = {
  interviewId: "int-1",
  jobTitle: "Backend Engineer",
  employerName: "Acme Inc",
  talentName: "Jane Doe",
  confirmedSlot: new Date("2026-08-25T07:00:00.000Z"),
  durationMinutes: 45,
  meetingUrl: "https://meet.example.com/room",
};

describe("buildInterviewIcs", () => {
  it("uses CRLF line endings throughout, per RFC 5545", () => {
    const ics = buildInterviewIcs(baseInput);
    expect(ics).not.toMatch(/(?<!\r)\n/);
    expect(ics.split("\r\n").length).toBeGreaterThan(1);
  });

  it("wraps the event in BEGIN/END VCALENDAR and VEVENT", () => {
    const ics = buildInterviewIcs(baseInput);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("derives DTEND from confirmedSlot + durationMinutes", () => {
    const ics = buildInterviewIcs(baseInput);
    expect(ics).toContain("DTSTART:20260825T070000Z");
    // 07:00 + 45 minutes = 07:45
    expect(ics).toContain("DTEND:20260825T074500Z");
  });

  it("produces a UID stable across calls for the same interview (re-download updates, doesn't duplicate)", () => {
    const first = buildInterviewIcs(baseInput);
    const second = buildInterviewIcs(baseInput);
    const uidOf = (ics: string) => ics.match(/UID:(.+)\r\n/)?.[1];

    expect(uidOf(first)).toBe(uidOf(second));
    expect(uidOf(first)).toBe("interview-int-1@remotesea.io");
  });

  it("includes the meeting URL as LOCATION when present", () => {
    const ics = buildInterviewIcs(baseInput);
    expect(ics).toContain("LOCATION:https://meet.example.com/room");
  });

  it("omits LOCATION entirely when there's no meeting URL yet", () => {
    const ics = buildInterviewIcs({ ...baseInput, meetingUrl: null });
    expect(ics).not.toContain("LOCATION:");
  });

  it("escapes commas, semicolons, and backslashes in free-text fields", () => {
    const ics = buildInterviewIcs({
      ...baseInput,
      jobTitle: "Engineer, Backend; Platform\\Infra",
    });
    expect(ics).toContain("Engineer\\, Backend\\; Platform\\\\Infra");
  });

  it("joins multi-line description parts with an escaped \\n, not a raw newline", () => {
    const ics = buildInterviewIcs(baseInput);
    const descriptionLine = unfold(ics)
      .split("\r\n")
      .find((line) => line.startsWith("DESCRIPTION:"));

    expect(descriptionLine).toBeDefined();
    expect(descriptionLine).toContain("\\n\\n");
    // The raw DESCRIPTION *logical* line must stay a single line once
    // unfolded — an unescaped newline inside it would corrupt the file
    // structure.
    expect(descriptionLine).not.toMatch(/\r|\n$/);
  });

  it("falls back gracefully when there's no talent name yet", () => {
    const ics = buildInterviewIcs({ ...baseInput, talentName: null });
    expect(ics).not.toContain("Candidate:");
  });

  // RFC 5545 §3.1: no physical line may exceed 75 octets. This job title is
  // long enough that DESCRIPTION (which embeds it twice) would otherwise
  // produce a single 100+ octet line that Outlook in particular can mangle.
  it("folds a physical line longer than 75 octets, and unfolding reconstructs it exactly", () => {
    const longInput: InterviewIcsInput = {
      ...baseInput,
      jobTitle:
        "Senior Staff Backend Engineer for Platform Infrastructure and Reliability",
    };
    const ics = buildInterviewIcs(longInput);

    for (const physicalLine of ics.split("\r\n")) {
      expect(Buffer.byteLength(physicalLine, "utf8")).toBeLessThanOrEqual(75);
    }
    // At least one fold actually happened (a continuation line starts with
    // exactly one space) — otherwise this test would pass vacuously.
    expect(ics).toMatch(/\r\n /);

    const unfolded = unfold(ics);
    expect(unfolded).toContain(
      `Interview for ${longInput.jobTitle} at ${longInput.employerName}`,
    );
  });

  // Folding must not split a multi-byte UTF-8 character across two lines —
  // doing so would produce invalid UTF-8 in whichever fragment lost half a
  // character. Vietnamese company/candidate names are a realistic case for
  // this codebase specifically, not a contrived edge case.
  it("does not split a multi-byte UTF-8 character when folding", () => {
    const longName = "Cong Ty Cong Nghe Việt Nam ".repeat(6).trim();
    const ics = buildInterviewIcs({ ...baseInput, employerName: longName });

    for (const physicalLine of ics.split("\r\n")) {
      // A line ending mid-character decodes to the U+FFFD replacement
      // character when round-tripped through UTF-8 — a clean split never
      // produces one.
      expect(Buffer.from(physicalLine, "utf8").toString("utf8")).not.toContain(
        "�",
      );
    }
    expect(unfold(ics)).toContain(longName);
  });

  it("includes a day-before and a 15-minutes-before reminder", () => {
    const ics = buildInterviewIcs(baseInput);
    const alarmCount = ics.split("BEGIN:VALARM").length - 1;

    expect(alarmCount).toBe(2);
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics).toContain("ACTION:DISPLAY");
  });
});
