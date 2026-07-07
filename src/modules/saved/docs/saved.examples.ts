/** Request/response example payloads for the Saved Jobs module's Swagger docs. */

export const SavedJobsListExample = [
  {
    userId: "cusr1a2b0000ug0h9x1n1a2",
    jobId: "cjob1a2b0000ug0h9x1n1a2",
    createdAt: "2026-07-02T09:00:00.000Z",
    job: {
      id: "cjob1a2b0000ug0h9x1n1a2",
      title: "Senior Backend Engineer",
      slug: "senior-backend-engineer",
      status: "ACTIVE",
      employer: { companyName: "Acme Corp", slug: "acme-corp" },
    },
  },
];

export const EmptySavedJobsListExample: unknown[] = [];

export const NewlySavedExample = { saved: true };

export const UnSavedExample = { saved: false };
