// Same 4 criteria the frontend's admin.utils.ts `autoChecks` already computes
// for the (display-only) admin review panel — mirrored here to also *gate*
// auto-approval for verified employers. Deliberate duplication, not a shared
// package: same precedent as TIMEZONE_OVERLAP_COUNTRY being duplicated
// between the two repos.
export const MIN_DESCRIPTION_LENGTH = 100;

export type JobVerificationInput = {
  title?: string;
  description: string;
  salaryMin: number | null;
  categoryCount: number;
};

// PB44 AC2.1: a listing whose text contains a banned keyword is never
// auto-approved — it goes to PENDING_REVIEW for a human moderator instead.
// Default list = the scam/low-quality red flags job-moderation.service.ts's
// prompt already names (upfront payment, starter kits, …) plus gambling and
// MLM, in English and Vietnamese. Exact phrases only (whole-word match), so
// ordinary job text doesn't trip it. JOB_BANNED_KEYWORDS (comma-separated)
// replaces the whole list; set it to an empty value to disable the check.
export const DEFAULT_BANNED_KEYWORDS: readonly string[] = [
  "upfront fee",
  "upfront payment",
  "registration fee",
  "application fee",
  "training fee",
  "starter kit",
  "deposit required",
  "pay to apply",
  "western union",
  "gift card",
  "pyramid scheme",
  "multi-level marketing",
  "mlm",
  "casino",
  "gambling",
  "get rich quick",
  "phí đăng ký",
  "phí đào tạo",
  "phí hồ sơ",
  "đặt cọc",
  "đa cấp",
  "cờ bạc",
  "việc nhẹ lương cao",
];

export function parseBannedKeywords(raw: string | undefined): string[] {
  if (raw === undefined) return [...DEFAULT_BANNED_KEYWORDS];
  if (!raw.trim()) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((keyword) => keyword.trim().toLowerCase())
        .filter((keyword) => keyword.length > 0),
    ),
  ];
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word match (letters/digits on either side don't count), so a banned
// "bet" doesn't flag "better". Unicode-aware for Vietnamese text.
export function findBannedKeyword(
  text: string,
  bannedKeywords: readonly string[],
): string | null {
  const haystack = text.toLowerCase();
  for (const keyword of bannedKeywords) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(keyword)}(?![\\p{L}\\p{N}])`,
      "u",
    );
    if (pattern.test(haystack)) return keyword;
  }
  return null;
}

export function isEligibleForAutoApproval(
  job: JobVerificationInput,
  employerIsVerified: boolean,
  bannedKeywords: readonly string[] = [],
): boolean {
  return (
    employerIsVerified &&
    job.description.length >= MIN_DESCRIPTION_LENGTH &&
    job.salaryMin != null &&
    job.categoryCount > 0 &&
    findBannedKeyword(
      `${job.title ?? ""}\n${job.description}`,
      bannedKeywords,
    ) === null
  );
}
