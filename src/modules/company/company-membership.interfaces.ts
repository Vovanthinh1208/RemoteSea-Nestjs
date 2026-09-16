import type { CompanyMemberRole } from "@prisma/client";

// The one shape every employer-facing module resolves "which company does
// this user act as, and with what role" into. Canonical home for this type —
// modules/team, modules/jobs, modules/employer, and modules/interviews all
// import it from here rather than each defining their own copy.
//
// suspendedAt is the company's EmployerProfile.suspendedAt, carried through
// so callers that gate a *privileged action* (requireCompanyRole,
// CompanyOwnershipGuardBase) can block it without changing what
// resolveMembership itself returns — some callers deliberately need the raw
// membership regardless of suspension (e.g. the "does this user already
// occupy a company slot" dedupe checks in EmployerService.createProfile and
// TeamService.inviteMember/acceptInvitation, where a suspended seat must
// still count as occupied, not be silently ignored).
export type CompanyMembership = {
  employerId: string;
  role: CompanyMemberRole;
  suspendedAt: Date | null;
};
