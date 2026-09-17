import { buildApplicantsCsv, type ApplicantCsvRow } from "./applicant-csv.util";

const baseRow: ApplicantCsvRow = {
  status: "SHORTLISTED",
  appliedAt: new Date("2026-01-15T10:00:00.000Z"),
  resumeUrl: "https://cdn.example.com/resume.pdf",
  coverLetter: "Excited to apply.",
  talent: {
    slug: "jane-doe",
    headline: "Backend Engineer",
    level: "SENIOR",
    yearsExperience: 6,
    country: "Vietnam",
    user: { name: "Jane Doe" },
  },
};

describe("buildApplicantsCsv", () => {
  it("emits a header row followed by one row per applicant", () => {
    const csv = buildApplicantsCsv([baseRow], "https://remotesea.io");
    const lines = csv.trim().split("\r\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      '"Name","Profile","Headline","Level","Years experience","Country","Status","Applied at","Resume URL","Cover letter"',
    );
  });

  it("builds the public profile URL from the given frontendUrl and the talent's slug", () => {
    const csv = buildApplicantsCsv([baseRow], "https://remotesea.io");
    expect(csv).toContain('"https://remotesea.io/talent/jane-doe"');
  });

  it("renders a null field (no cover letter, no resume) as an empty quoted string, not the literal 'null'", () => {
    const csv = buildApplicantsCsv(
      [{ ...baseRow, resumeUrl: null, coverLetter: null }],
      "https://remotesea.io",
    );
    const dataLine = csv.trim().split("\r\n")[1]!;

    expect(dataLine.endsWith('"",""')).toBe(true);
    expect(dataLine).not.toContain("null");
  });

  // RFC 4180: a field containing a comma, quote, or newline must be quoted,
  // with embedded quotes doubled — a cover letter is exactly the kind of
  // free-text field that will eventually contain all three.
  it("escapes embedded double quotes and preserves commas/newlines inside a quoted field", () => {
    const csv = buildApplicantsCsv(
      [
        {
          ...baseRow,
          coverLetter: 'I said "hire me", please.\nThanks!',
        },
      ],
      "https://remotesea.io",
    );

    expect(csv).toContain('"I said ""hire me"", please.\nThanks!"');
  });

  it("produces exactly one CSV row per applicant, in the given order", () => {
    const second: ApplicantCsvRow = {
      ...baseRow,
      talent: {
        ...baseRow.talent,
        slug: "john-smith",
        user: { name: "John Smith" },
      },
    };
    const csv = buildApplicantsCsv([baseRow, second], "https://remotesea.io");
    const lines = csv.trim().split("\r\n");

    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Jane Doe"');
    expect(lines[2]).toContain('"John Smith"');
  });
});
