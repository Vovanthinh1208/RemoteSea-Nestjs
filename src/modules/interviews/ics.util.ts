export type InterviewIcsInput = {
  interviewId: string;
  jobTitle: string;
  employerName: string;
  talentName: string | null;
  confirmedSlot: Date;
  durationMinutes: number;
  meetingUrl: string | null;
};

// RFC 5545 requires CRLF line endings and TEXT values with `,`, `;`, `\`
// and embedded newlines backslash-escaped — a raw title/company name with
// any of those would otherwise produce a calendar file that fails to
// parse (or silently truncates) in at least one of Google/Outlook/Apple
// Calendar rather than just looking slightly off.
const escapeIcsText = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

// YYYYMMDDTHHMMSSZ — the UTC "form 2" date-time from RFC 5545 §3.3.5. Using
// UTC (not a floating local time) means the event lands at the correct
// instant in whatever calendar app/timezone opens it, which matters more
// here than anywhere else in this app: interview participants are
// frequently in different countries by design (remote hiring).
const toIcsUtcDateTime = (date: Date): string =>
  `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;

/** Generates an RFC 5545 .ics file for a CONFIRMED interview — the caller
 * (InterviewsService.getIcsFile) is responsible for only calling this once
 * status/confirmedSlot have already been checked. Pure and synchronous so
 * it's unit-testable without a database. */
export const buildInterviewIcs = (input: InterviewIcsInput): string => {
  const start = input.confirmedSlot;
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const summary = `Interview: ${input.jobTitle} at ${input.employerName}`;
  const descriptionParts = [
    `Interview for ${input.jobTitle} at ${input.employerName}`,
    input.talentName ? `Candidate: ${input.talentName}` : null,
    input.meetingUrl ? `Meeting link: ${input.meetingUrl}` : null,
  ].filter((part): part is string => part !== null);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RemoteSEA//Interview//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // Stable per interview: re-downloading after a reschedule updates the
    // same calendar entry (matched by UID) instead of creating a duplicate,
    // in any calendar app that honors RFC 5545 UID semantics on re-import.
    `UID:interview-${input.interviewId}@remotesea.io`,
    `DTSTAMP:${toIcsUtcDateTime(new Date())}`,
    `DTSTART:${toIcsUtcDateTime(start)}`,
    `DTEND:${toIcsUtcDateTime(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    // Real newlines joined first, then escaped as a whole — escapeIcsText
    // turns each into the literal two-character `\n` sequence RFC 5545
    // wants; joining with an already-escaped separator would double-escape
    // the backslash itself.
    `DESCRIPTION:${escapeIcsText(descriptionParts.join("\n\n"))}`,
    ...(input.meetingUrl
      ? [`LOCATION:${escapeIcsText(input.meetingUrl)}`]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n") + "\r\n";
};
