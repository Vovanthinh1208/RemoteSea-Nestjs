// Same 4 criteria the frontend's admin.utils.ts `autoChecks` already computes
// for the (display-only) admin review panel — mirrored here to also *gate*
// auto-approval for verified employers. Deliberate duplication, not a shared
// package: same precedent as TIMEZONE_OVERLAP_COUNTRY being duplicated
// between the two repos.
export const MIN_DESCRIPTION_LENGTH = 100;

export type JobVerificationInput = {
  description: string;
  salaryMin: number | null;
  categoryCount: number;
};

export function isEligibleForAutoApproval(
  job: JobVerificationInput,
  employerIsVerified: boolean,
): boolean {
  return (
    employerIsVerified &&
    job.description.length >= MIN_DESCRIPTION_LENGTH &&
    job.salaryMin != null &&
    job.categoryCount > 0
  );
}
