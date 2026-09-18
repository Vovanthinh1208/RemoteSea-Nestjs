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

  it("prefixes the output with a UTF-8 BOM so Excel opens it as UTF-8 rather than a legacy codepage", () => {
    const csv = buildApplicantsCsv([baseRow], "https://remotesea.io");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("preserves non-ASCII text (Vietnamese) unmodified", () => {
    const csv = buildApplicantsCsv(
      [
        {
          ...baseRow,
          talent: {
            ...baseRow.talent,
            headline: "Kỹ sư phần mềm",
            country: "Việt Nam",
            user: { name: "Nguyễn Văn A" },
          },
        },
      ],
      "https://remotesea.io",
    );

    expect(csv).toContain('"Nguyễn Văn A"');
    expect(csv).toContain('"Kỹ sư phần mềm"');
    expect(csv).toContain('"Việt Nam"');
  });

  it("emits a valid header-only CSV (still BOM-prefixed) for an empty applicant list", () => {
    const csv = buildApplicantsCsv([], "https://remotesea.io");
    const lines = csv.slice(1).trim().split("\r\n");

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      '"Name","Profile","Headline","Level","Years experience","Country","Status","Applied at","Resume URL","Cover letter"',
    );
  });

  // OWASP CSV injection: talent-supplied free text (headline, cover letter,
  // name) must not be able to smuggle a spreadsheet formula into an
  // employer's Excel session just by starting with one of these characters.
  it.each(["=cmd|'/c calc'!A1", "+1+1", "-1-1", "@SUM(A1:A9)"])(
    "neutralizes a formula-triggering leading character (%s)",
    (payload) => {
      const csv = buildApplicantsCsv(
        [{ ...baseRow, talent: { ...baseRow.talent, headline: payload } }],
        "https://remotesea.io",
      );
      expect(csv).toContain(`"'${payload}"`);
    },
  );

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
