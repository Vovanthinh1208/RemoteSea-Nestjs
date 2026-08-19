import type { Prisma } from "@prisma/client";

// Re-exported so existing imports of `CompanyMembership` from this module
// keep working — the type itself now lives in modules/company, the shared
// leaf module Team/Jobs/Employer/Interviews all depend on.
export type { CompanyMembership } from "@/modules/company/company-membership.interfaces";

export const teamMemberSelect = {
  id: true,
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.CompanyMemberSelect;

export type TeamMember = Prisma.CompanyMemberGetPayload<{
  select: typeof teamMemberSelect;
}>;

export const pendingInvitationSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
  invitedBy: { select: { name: true } },
} satisfies Prisma.TeamInvitationSelect;

export type PendingInvitation = Prisma.TeamInvitationGetPayload<{
  select: typeof pendingInvitationSelect;
}>;

export const memberOwnershipSelect = {
  id: true,
  userId: true,
  employerId: true,
  role: true,
} satisfies Prisma.CompanyMemberSelect;

export type MemberForOwnership = Prisma.CompanyMemberGetPayload<{
  select: typeof memberOwnershipSelect;
}>;
