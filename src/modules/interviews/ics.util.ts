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
    .replace(/\r\n|\r|\n/g, "\\n");

// RFC 5545 §3.1: a content line SHOULD NOT exceed 75 octets (not
// characters — a company/candidate name with non-ASCII text is multi-byte
// in UTF-8, so this has to fold on byte boundaries, not string length).
// Without this, a long job title + description + meeting URL produces a
// line some calendar clients (Outlook in particular) truncate or refuse to
// parse rather than just rendering long. Folded per spec: split at 75
// octets, CRLF, then a single leading space on each continuation line
// (which every RFC 5545 reader strips back out on unfold).
const MAX_LINE_OCTETS = 75;

const foldIcsLine = (line: string): string => {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= MAX_LINE_OCTETS) return line;

  const parts: string[] = [];
  let start = 0;
  let isFirst = true;
  while (start < bytes.length) {
    // Continuation lines carry one less octet of real content than the
    // first line — their leading space counts toward the same 75-octet
    // physical-line cap as everything else on the line.
    const budget = isFirst ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    let end = Math.min(start + budget, bytes.length);
    // Never split inside a multi-byte UTF-8 sequence — back off while the
    // byte at `end` is a continuation byte (10xxxxxx). `end < bytes.length`
    // in the loop condition guarantees this index is always in range.
    while (end < bytes.length && ((bytes.at(end) ?? 0) & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    isFirst = false;
  }
  return parts.join("\r\n ");
};

// YYYYMMDDTHHMMSSZ — the UTC "form 2" date-time from RFC 5545 §3.3.5. Using
// UTC (not a floating local time) means the event lands at the correct
// instant in whatever calendar app/timezone opens it, which matters more
// here than anywhere else in this app: interview participants are
// frequently in different countries by design (remote hiring).
const toIcsUtcDateTime = (date: Date): string =>
  `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;

// Two reminders, not one — this is the entire point of the feature (goal:
// "reduce missed interviews"), and a single alarm right before the call
// only helps someone who's already at their desk. A day-before nudge
// covers "I forgot to block my calendar"; the 15-minute one covers "I
// forgot it was now." Every mainstream calendar app (Google/Outlook/Apple)
// imports and honors VALARM triggers from a PUBLISH-method .ics.
const ALARM_TRIGGERS: { trigger: string; label: string }[] = [
  { trigger: "-P1D", label: "in 1 day" },
  { trigger: "-PT15M", label: "in 15 minutes" },
];

const buildAlarm = (trigger: string, summary: string): string[] => [
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  `TRIGGER:${trigger}`,
  `DESCRIPTION:${escapeIcsText(summary)}`,
  "END:VALARM",
];

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
    ...ALARM_TRIGGERS.flatMap(({ trigger, label }) =>
      buildAlarm(trigger, `${summary} — ${label}`),
    ),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
};
