/** Request/response example payloads for the Employer module's Swagger docs. */

export const CreateEmployerProfileRequestExample = {
  companyName: "RemoteSEA Ltd",
  websiteUrl: "https://remotesea.io",
  industry: "Technology",
  hqCountry: "Vietnam",
};

export const CreateEmployerProfileResponseExample = {
  id: "clx1a2b3c4d5e6f7g8h9i0j1",
  slug: "remotesea-ltd",
  companyName: "RemoteSEA Ltd",
};

export const EmployerProfileWithStatsResponseExample = {
  id: "clx1a2b3c4d5e6f7g8h9i0j1",
  companyName: "RemoteSEA Ltd",
  slug: "remotesea-ltd",
  isVerified: false,
  _count: { jobs: 4 },
  totalApplications: 27,
};

export const UpdateEmployerProfileRequestExample = {
  companyName: "RemoteSEA Pte Ltd",
  industry: "Technology",
  founded: 2019,
};

export const EmployerProfileResponseExample = {
  id: "clx1a2b3c4d5e6f7g8h9i0j1",
  companyName: "RemoteSEA Pte Ltd",
  slug: "remotesea-ltd",
  logoUrl: null,
  websiteUrl: "https://remotesea.io",
  description: null,
  industry: "Technology",
  size: "11-50",
  founded: 2019,
  hqCountry: "Vietnam",
  hqCity: "Ho Chi Minh City",
  isVerified: false,
  createdAt: "2026-01-05T09:00:00.000Z",
  updatedAt: "2026-06-01T10:00:00.000Z",
};

export const ListEmployerJobsResponseExample = {
  jobs: [
    {
      id: "cljob1a2b3c4d5e6f7g8h9i0",
      title: "Senior Backend Engineer",
      slug: "senior-backend-engineer-a1b2c3",
      status: "ACTIVE",
      planType: "STANDARD",
      planPaid: false,
      viewCount: 342,
      applyCount: 12,
      publishedAt: "2026-05-01T08:00:00.000Z",
      createdAt: "2026-04-20T08:00:00.000Z",
      _count: { applications: 12 },
    },
  ],
  stats: {
    totalApps: 27,
    shortlisted: 5,
    avgTimeToHireInDays: 6.4,
    avgFirstResponseHours: 18.2,
  },
};

export const ListJobApplicationsResponseExample = {
  applications: [
    {
      id: "clapp1a2b3c4d5e6f7g8h9i0",
      status: "REVIEWING",
      appliedAt: "2026-06-10T12:00:00.000Z",
      viewedAt: "2026-06-11T08:00:00.000Z",
      updatedAt: "2026-06-11T09:15:00.000Z",
      coverLetter: "I would love to join your team...",
      talent: {
        id: "cltal1a2b3c4d5e6f7g8h9i0",
        slug: "jane-doe",
        headline: "Full-stack Developer",
        level: "SENIOR",
        user: { name: "Jane Doe" },
        skills: [],
      },
    },
  ],
  pagination: { page: 1, limit: 20, total: 12, pages: 1 },
};

export const UpdateApplicationRequestExample = {
  status: "REVIEWING",
  notes: "Strong candidate, moving to interview.",
};

export const ApplicationResponseExample = {
  id: "clapp1a2b3c4d5e6f7g8h9i0",
  jobId: "cljob1a2b3c4d5e6f7g8h9i0",
  talentId: "cltal1a2b3c4d5e6f7g8h9i0",
  coverLetter: "I would love to join your team...",
  resumeUrl: null,
  status: "REVIEWING",
  notes: "Strong candidate, moving to interview.",
  appliedAt: "2026-06-10T12:00:00.000Z",
  updatedAt: "2026-06-15T09:30:00.000Z",
};

export const EmployerValidationErrorExample = {
  error: {
    formErrors: [],
    fieldErrors: {
      companyName: ["String must contain at least 2 character(s)"],
    },
  },
};

export const SubmitVerificationRequestExample = { email: "jane@acme.com" };

export const SubmitVerificationResponseExample = {
  message: "Verification email sent",
};

export const ConfirmVerificationRequestExample = {
  token: "9f3c2a1b8e7d6f5a4c3b2a1908f7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5c4",
};

export const ConfirmVerificationResponseExample = {
  message: "Company email verified",
};

export const PublicCompanyProfileResponseExample = {
  id: "clx1a2b3c4d5e6f7g8h9i0j1",
  userId: "clxuser1a2b3c4d5e6f7g8h9",
  companyName: "Saigon Cloudworks",
  slug: "saigon-cloudworks-pSqMpG",
  logoUrl: null,
  websiteUrl: "https://saigoncloudworks.dev",
  description: "We build remote-friendly products for teams across SEA.",
  industry: "Technology",
  size: "11-50",
  founded: 2019,
  hqCountry: "Malaysia",
  hqCity: null,
  isVerified: true,
  verifiedAt: "2026-05-01T09:00:00.000Z",
  createdAt: "2026-01-05T09:00:00.000Z",
  activeJobCount: 3,
  vnHireTotal: 12,
  avgFirstResponseHours: 18.5,
  jobs: [
    {
      id: "cjob1a2b0000ug0h9x1n1a2",
      title: "Senior Backend Engineer",
      jobType: "FULL_TIME",
      level: "SENIOR",
      salaryMin: 3000,
      salaryMax: 5000,
      currency: "USD",
      isRemote: true,
      isFeatured: false,
      publishedAt: "2026-07-11T09:26:19.006Z",
    },
  ],
};

export const CompanyNotFoundExample = { error: "Company not found" };
