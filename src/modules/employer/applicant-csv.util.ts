// Same select EmployerRepository.findApplicationsForJob already returns to
// GET /employer/jobs/:id/applications — this is a serializer over that
// existing shape, not a new query. Loosely typed (rather than importing
// EmployerRepository's inferred Prisma payload type) so this file stays a
// pure, dependency-free unit — every field it reads is optional/nullable
// exactly where the real select allows it to be.
export type ApplicantCsvRow = {
  status: string;
  appliedAt: Date;
  resumeUrl: string | null;
  coverLetter: string | null;
  talent: {
    slug: string;
    headline: string | null;
    level: string;
    yearsExperience: number | null;
    country: string | null;
    user: { name: string | null };
  };
};

const CSV_COLUMNS = [
  "Name",
  "Profile",
  "Headline",
  "Level",
  "Years experience",
  "Country",
  "Status",
  "Applied at",
  "Resume URL",
  "Cover letter",
] as const;

// OWASP CSV injection: a field opening with one of these is interpreted as
// a formula by Excel/Sheets/LibreOffice on open — dangerous here because
// several columns (name, headline, cover letter) are talent-supplied free
// text, not employer- or system-controlled. Prefixing a bare apostrophe
// forces spreadsheet apps to render it as literal text instead of
// evaluating it, at the cost of one visible leading `'` in that rare case.
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

// RFC 4180: a field containing a comma, quote, or newline must be wrapped in
// double quotes, with any embedded double quote doubled. Every field here
// goes through this unconditionally — cheaper and safer than deciding
// per-field whether quoting is "needed" (a cover letter is exactly the kind
// of free-text field that will eventually contain a comma or a line break).
const csvField = (value: string | number | null): string => {
  const text = value === null ? "" : String(value);
  const safe = FORMULA_TRIGGER_CHARS.has(text[0] ?? "") ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

// Excel (Windows in particular) only reliably detects a CSV as UTF-8 —
// rather than guessing a legacy codepage and mangling non-ASCII text like
// Vietnamese names — when the file starts with this byte-order mark. Only
// affects how the *first* byte is written; every field still comes through
// as plain UTF-8, BOM or not.
const UTF8_BOM = "﻿";

/** Pure serializer: EmployerRepository's existing applicant select ->
 * RFC 4180 CSV text. `frontendUrl` (no trailing slash) builds the public
 * profile link — passed in rather than hardcoded so this stays a pure
 * function independent of ConfigService, matching how BillingService reads
 * FRONTEND_URL and passes derived values down rather than every layer
 * reading env itself. */
export const buildApplicantsCsv = (
  applications: ApplicantCsvRow[],
  frontendUrl: string,
): string => {
  const header = CSV_COLUMNS.map(csvField).join(",");
  const rows = applications.map((a) =>
    [
      csvField(a.talent.user.name),
      csvField(`${frontendUrl}/talent/${a.talent.slug}`),
      csvField(a.talent.headline),
      csvField(a.talent.level),
      csvField(a.talent.yearsExperience),
      csvField(a.talent.country),
      csvField(a.status),
      csvField(a.appliedAt.toISOString()),
      csvField(a.resumeUrl),
      csvField(a.coverLetter),
    ].join(","),
  );

  // CRLF line endings — RFC 4180's own recommendation, and what makes
  // Excel (still the single most common CSV consumer for this kind of
  // export) render this reliably rather than occasionally mis-joining
  // rows depending on how it's opened. A filtered-to-empty result still
  // produces a valid CSV — just the header row — rather than an empty file.
  return UTF8_BOM + [header, ...rows].join("\r\n") + "\r\n";
};
