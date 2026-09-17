import { buildInterviewIcs, type InterviewIcsInput } from "./ics.util";

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
    const descriptionLine = ics
      .split("\r\n")
      .find((line) => line.startsWith("DESCRIPTION:"));

    expect(descriptionLine).toBeDefined();
    expect(descriptionLine).toContain("\\n\\n");
    // The raw DESCRIPTION *line itself* must stay a single physical line —
    // an unescaped newline inside it would corrupt the file structure.
    expect(descriptionLine).not.toMatch(/\r|\n$/);
  });

  it("falls back gracefully when there's no talent name yet", () => {
    const ics = buildInterviewIcs({ ...baseInput, talentName: null });
    expect(ics).not.toContain("Candidate:");
  });
});
