/** Request/response example payloads for the Jobs module's Swagger docs. */

const jobListItemExample = {
  id: "cljob1a2b3c4d5e6f7g8h9i0",
  title: "Senior Backend Engineer",
  slug: "senior-backend-engineer-a1b2c3",
  description: "We are looking for a senior backend engineer to join our remote team...",
  jobType: "FULL_TIME",
  level: "SENIOR",
  salaryMin: 60000,
  salaryMax: 90000,
  currency: "USD",
  isRemote: true,
  timezone: "UTC+7",
  country: "Vietnam",
  status: "ACTIVE",
  planType: "STANDARD",
  benefits: ["Health insurance", "Remote stipend"],
  isFeatured: false,
  viewCount: 342,
  applyCount: 12,
  publishedAt: "2026-05-01T08:00:00.000Z",
  createdAt: "2026-04-20T08:00:00.000Z",
  employer: { companyName: "RemoteSEA Ltd", logoUrl: null, slug: "remotesea-ltd" },
  categories: [{ category: { id: "clcat1a2b3c4d5e6f7g8h9i0", name: "Engineering", slug: "engineering", icon: "code" } }],
  skills: [{ skill: { id: "clskl1a2b3c4d5e6f7g8h9i0", name: "TypeScript", slug: "typescript" }, isRequired: true }],
};

export const ListJobsResponseExample = {
  jobs: [jobListItemExample],
  pagination: { page: 1, limit: 20, total: 57, pages: 3 },
  facets: {
    jobType: { "Full-time": 41, Contract: 12, "Part-time": 4 },
    timezone: { sea: 30, async: 9, SG: 14, AU: 8, US: 5 },
    seniority: { Entry: 9, Mid: 28, Senior: 20 },
    category: { Engineering: 24, Design: 10, Data: 7, Product: 9, Marketing: 7 },
  },
};

export const CreateJobRequestExample = {
  title: "Senior Backend Engineer",
  description:
    "We are looking for a senior backend engineer to join our remote team and help scale our platform across Southeast Asia. You will own core services, mentor junior engineers, and collaborate closely with product.",
  requirements: "5+ years with Node.js, PostgreSQL, and distributed systems.",
  jobType: "FULL_TIME",
  level: "SENIOR",
  salaryMin: 60000,
  salaryMax: 90000,
  timezone: "UTC+7",
  country: "Vietnam",
  benefits: ["Health insurance", "Remote stipend"],
  planType: "STANDARD",
  categoryIds: ["clcat1a2b3c4d5e6f7g8h9i0"],
  skillIds: ["clskl1a2b3c4d5e6f7g8h9i0"],
};

export const CreateJobResponseExample = {
  id: "cljob1a2b3c4d5e6f7g8h9i0",
  slug: "senior-backend-engineer-a1b2c3",
  status: "DRAFT",
};

export const JobDetailResponseExample = {
  ...jobListItemExample,
  requirements: "5+ years with Node.js, PostgreSQL, and distributed systems.",
  responsibilities: null,
  applicationUrl: null,
  reviewNote: null,
  expiresAt: null,
  updatedAt: "2026-06-01T10:00:00.000Z",
  employer: { companyName: "RemoteSEA Ltd", logoUrl: null, slug: "remotesea-ltd", isVerified: true },
};

export const UpdateJobRequestExample = {
  title: "Senior Backend Engineer (Remote)",
  salaryMax: 95000,
};

export const JobsValidationErrorExample = {
  error: { formErrors: [], fieldErrors: { title: ["String must contain at least 5 character(s)"] } },
};
