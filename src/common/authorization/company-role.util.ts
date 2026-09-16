import type { CompanyMemberRole } from "@prisma/client";
import { ForbiddenApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { CompanyMembership } from "@/modules/company/company-membership.interfaces";

// Named role-sets — a single source of truth for "who can do X" instead of
// each service (Team/Jobs/Employer) declaring its own copy of the same
// domain rule. Add a new tier here, not as a local const in a service file.
export const OWNER_ONLY: readonly CompanyMemberRole[] = ["OWNER"];
export const JOB_MANAGEMENT_ROLES: readonly CompanyMemberRole[] = [
  "OWNER",
  "RECRUITER",
];
export const APPLICATION_REVIEW_ROLES: readonly CompanyMemberRole[] = [
  "OWNER",
  "RECRUITER",
  "HIRING_MANAGER",
];
// Membership-only gate (any seat qualifies) — for routes open to the whole
// team where the *response*, not route access, is what narrows by role
// (e.g. the interview agenda: every member can call it, INTERVIEWER just
// gets their own interviews back instead of the company's).
export const ALL_COMPANY_ROLES: readonly CompanyMemberRole[] = [
  "OWNER",
  "RECRUITER",
  "HIRING_MANAGER",
  "INTERVIEWER",
];

export const hasCompanyRole = (
  membership: CompanyMembership | null,
  allowedRoles: readonly CompanyMemberRole[],
): boolean => !!membership && allowedRoles.includes(membership.role);

/**
 * The one place every *service-level* (non-resource-guarded) company-role
 * check goes through — routes with a single `:id` resource instead enforce
 * this via CompanyOwnershipGuardBase, which needs the resource's own
 * companyId, not just the caller's; this covers everything else (job
 * creation, listing, bulk actions, team management).
 */
export const requireCompanyRole = (
  membership: CompanyMembership | null,
  allowedRoles: readonly CompanyMemberRole[],
  forbiddenMessage = "Your role doesn't allow this action",
): CompanyMembership => {
  if (!membership) {
    throw new ForbiddenApiException(
      "Company membership required",
      ErrorCode.COMPANY_MEMBERSHIP_REQUIRED,
    );
  }
  // Checked before the role check below — a suspended OWNER should see
  // "your company was suspended," not a role-specific message that implies
  // a different seat on the same company would still work.
  if (membership.suspendedAt) {
    throw new ForbiddenApiException(
      "Your company's account has been suspended. Contact support for help.",
      ErrorCode.COMPANY_SUSPENDED,
    );
  }
  if (!allowedRoles.includes(membership.role)) {
    throw new ForbiddenApiException(
      forbiddenMessage,
      ErrorCode.INSUFFICIENT_COMPANY_ROLE,
    );
  }
  return membership;
};
