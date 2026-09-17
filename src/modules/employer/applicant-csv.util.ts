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

// RFC 4180: a field containing a comma, quote, or newline must be wrapped in
// double quotes, with any embedded double quote doubled. Every field here
// goes through this unconditionally — cheaper and safer than deciding
// per-field whether quoting is "needed" (a cover letter is exactly the kind
// of free-text field that will eventually contain a comma or a line break).
const csvField = (value: string | number | null): string => {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

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
  // rows depending on how it's opened.
  return [header, ...rows].join("\r\n") + "\r\n";
};
