/** Request/response example payloads for the Admin module's Swagger docs. */

export const ListEmployersResponseExample = {
  employers: [
    {
      id: "clx1emp0000ug0h9x1n1a2",
      companyName: "Acme Corp",
      isVerified: false,
      user: { email: "hiring@acme.com" },
      _count: { jobs: 4 },
      jobCount: 4,
      totalSpend: 50000,
    },
  ],
  pagination: { page: 1, limit: 20, total: 37, pages: 2 },
};

export const UpdateEmployerRequestExample = { action: "verify" };

export const UpdateEmployerResponseExample = { success: true };

export const EmployerNotFoundExample = { error: "Employer not found" };

export const ListJobsResponseExample = {
  jobs: [
    {
      id: "cjob1a2b0000ug0h9x1n1a2",
      title: "Senior Backend Engineer",
      slug: "senior-backend-engineer",
      status: "PENDING_REVIEW",
      employer: { companyName: "Acme Corp", isVerified: false, slug: "acme-corp" },
      categories: [{ category: { id: "ccat1a2b0000ug0h9x1n1a2", name: "Engineering", slug: "engineering" } }],
    },
  ],
  pagination: { page: 1, limit: 20, total: 12, pages: 1 },
};

export const ReviewJobRequestApproveExample = { action: "approve" };

export const ReviewJobRequestRejectExample = { action: "reject", note: "Missing salary range and job description is too vague." };

export const ReviewJobApprovedResponseExample = { status: "ACTIVE", publishedAt: "2026-07-02T10:05:00.000Z" };

export const ReviewJobRejectedResponseExample = { status: "REJECTED", publishedAt: null };

export const JobNotFoundExample = { error: "Job not found" };

export const ValidationErrorExample = {
  error: { formErrors: [], fieldErrors: { action: ["Invalid enum value"] } },
};
