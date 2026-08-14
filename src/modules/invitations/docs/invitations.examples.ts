/** Request/response example payloads for the Invitations module's Swagger docs. */

export const SendInvitationRequestExample = {
  jobId: "cjob1a2b0000ug0h9x1n1a2",
  talentId: "clx4talent0001abcd",
  message: "Loved your profile — would you consider applying?",
};

export const InvitationExample = {
  id: "cinv1a2b0000ug0h9x1n1a2",
  message: "Loved your profile — would you consider applying?",
  status: "PENDING",
  createdAt: "2026-08-14T09:12:00.000Z",
  respondedAt: null,
  job: {
    id: "cjob1a2b0000ug0h9x1n1a2",
    title: "Senior Backend Engineer",
    slug: "senior-backend-engineer-a1b2c3",
  },
  employer: {
    companyName: "Acme Corp",
    logoUrl: null,
    isVerified: true,
  },
};

export const InvitationsListExample = [InvitationExample];

export const RespondInvitationResponseExample = { status: "ACCEPTED" };

export const ValidationErrorExample = {
  error: {
    formErrors: [],
    fieldErrors: { jobId: ["Invalid cuid"] },
  },
};
