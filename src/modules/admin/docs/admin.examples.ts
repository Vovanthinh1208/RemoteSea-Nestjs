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
      employer: {
        companyName: "Acme Corp",
        isVerified: false,
        slug: "acme-corp",
      },
      categories: [
        {
          category: {
            id: "ccat1a2b0000ug0h9x1n1a2",
            name: "Engineering",
            slug: "engineering",
          },
        },
      ],
    },
  ],
  pagination: { page: 1, limit: 20, total: 12, pages: 1 },
};

export const ReviewJobRequestApproveExample = { action: "approve" };

export const ReviewJobRequestRejectExample = {
  action: "reject",
  note: "Missing salary range and job description is too vague.",
};

export const ReviewJobApprovedResponseExample = {
  status: "ACTIVE",
  publishedAt: "2026-07-02T10:05:00.000Z",
};

export const ReviewJobRejectedResponseExample = {
  status: "REJECTED",
  publishedAt: null,
};

export const JobNotFoundExample = { error: "Job not found" };

export const ValidationErrorExample = {
  error: { formErrors: [], fieldErrors: { action: ["Invalid enum value"] } },
};

export const RevenueResponseExample = {
  months: [
    {
      key: "2025-12",
      label: "Dec",
      standard: 15000,
      featured: 35000,
      handsOn: 0,
    },
    {
      key: "2026-01",
      label: "Jan",
      standard: 30000,
      featured: 70000,
      handsOn: 120000,
    },
    {
      key: "2026-02",
      label: "Feb",
      standard: 15000,
      featured: 35000,
      handsOn: 0,
    },
    {
      key: "2026-03",
      label: "Mar",
      standard: 45000,
      featured: 105000,
      handsOn: 0,
    },
    {
      key: "2026-04",
      label: "Apr",
      standard: 15000,
      featured: 70000,
      handsOn: 120000,
    },
    {
      key: "2026-05",
      label: "May",
      standard: 30000,
      featured: 35000,
      handsOn: 0,
    },
    {
      key: "2026-06",
      label: "Jun",
      standard: 15000,
      featured: 35000,
      handsOn: 0,
    },
    { key: "2026-07", label: "Jul", standard: 15000, featured: 0, handsOn: 0 },
  ],
  mix: [
    {
      planType: "STANDARD",
      label: "Standard listing",
      price: 15000,
      count: 11,
      amount: 165000,
    },
    {
      planType: "FEATURED",
      label: "Featured listing",
      price: 35000,
      count: 9,
      amount: 315000,
    },
    {
      planType: "HANDS_ON",
      label: "Hands-on hiring",
      price: 120000,
      count: 2,
      amount: 240000,
    },
  ],
  transactions: [
    {
      jobId: "cjob1a2b0000ug0h9x1n1a2",
      jobTitle: "Senior Backend Engineer",
      companyName: "Acme Corp",
      planType: "FEATURED",
      amount: 35000,
      paidAt: "2026-07-02T10:05:00.000Z",
    },
  ],
  totals: { allTime: 720000, thisMonth: 15000 },
};

export const ListReportsResponseExample = {
  reports: [
    {
      id: "crep1a2b0000ug0h9x1n1a2",
      reason: "SCAM",
      details: "Asked me to pay $200 for a 'starter laptop'.",
      status: "OPEN",
      createdAt: "2026-08-16T09:00:00.000Z",
      resolvedAt: null,
      job: {
        id: "cjob1a2b0000ug0h9x1n1a2",
        title: "Senior Backend Engineer",
        slug: "senior-backend-engineer",
        status: "ACTIVE",
        employer: { companyName: "Acme Corp" },
      },
      reporter: {
        id: "clx1tal0000ug0h9x1n1a2",
        email: "jane@example.com",
        name: "Jane Nguyen",
      },
    },
  ],
  pagination: { page: 1, limit: 20, total: 3, pages: 1 },
};

export const ResolveReportRequestExample = { action: "resolve" };

export const ResolveReportResponseExample = {
  id: "crep1a2b0000ug0h9x1n1a2",
  status: "RESOLVED",
  resolvedAt: "2026-08-16T10:00:00.000Z",
};

export const ReportNotFoundExample = { error: "Report not found" };

export const ListAuditLogResponseExample = {
  entries: [
    {
      id: "caud1a2b0000ug0h9x1n1a2",
      adminId: "cadm1a2b0000ug0h9x1n1a2",
      adminEmail: "admin@remotesea.io",
      action: "JOB_APPROVED",
      targetType: "JOB",
      targetId: "cjob1a2b0000ug0h9x1n1a2",
      targetLabel: "Senior Backend Engineer",
      before: { status: "PENDING_REVIEW" },
      after: { status: "ACTIVE" },
      createdAt: "2026-08-19T09:00:00.000Z",
    },
    {
      id: "caud2a2b0000ug0h9x1n1a3",
      adminId: "cadm1a2b0000ug0h9x1n1a2",
      adminEmail: "admin@remotesea.io",
      action: "EMPLOYER_SUSPENDED",
      targetType: "EMPLOYER",
      targetId: "cemp1a2b0000ug0h9x1n1a2",
      targetLabel: "Acme Corp",
      before: { isVerified: true },
      after: { isVerified: false },
      createdAt: "2026-08-18T14:30:00.000Z",
    },
  ],
  pagination: { page: 1, limit: 20, total: 2, pages: 1 },
};
