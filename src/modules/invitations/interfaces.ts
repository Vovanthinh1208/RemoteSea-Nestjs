import type { Prisma } from "@prisma/client";

// Talent-facing shape for GET /invitations — job/employer summary only,
// nothing about the sending employer's own account.
export const invitationForTalentSelect = {
  id: true,
  message: true,
  status: true,
  createdAt: true,
  respondedAt: true,
  job: { select: { id: true, title: true, slug: true } },
  employer: {
    select: { companyName: true, logoUrl: true, isVerified: true },
  },
} satisfies Prisma.JobInvitationSelect;

export type InvitationForTalent = Prisma.JobInvitationGetPayload<{
  select: typeof invitationForTalentSelect;
}>;

export const invitationOwnerSelect = {
  id: true,
  jobId: true,
  talentId: true,
  status: true,
  talent: { select: { userId: true, user: { select: { name: true } } } },
} satisfies Prisma.JobInvitationSelect;

export type InvitationOwner = Prisma.JobInvitationGetPayload<{
  select: typeof invitationOwnerSelect;
}>;

export type CreateInvitationInput = {
  jobId: string;
  talentId: string;
  employerId: string;
  message?: string;
};
