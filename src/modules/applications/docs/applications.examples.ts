/** Request/response example payloads for the Applications module's Swagger docs. */

export const ApplyRequestExample = {
  jobId: "cjob1a2b0000ug0h9x1n1a2",
  coverLetter: "I'd love to bring my remote QA experience to this role.",
  resumeUrl: "https://cdn.remotesea.com/resumes/jane-doe.pdf",
};

export const ApplyResponseExample = {
  id: "capp1a2b0000ug0h9x1n1a2",
  jobId: "cjob1a2b0000ug0h9x1n1a2",
  talentId: "ctal1a2b0000ug0h9x1n1a2",
  coverLetter: "I'd love to bring my remote QA experience to this role.",
  resumeUrl: "https://cdn.remotesea.com/resumes/jane-doe.pdf",
  status: "PENDING",
  notes: null,
  appliedAt: "2026-07-02T09:00:00.000Z",
  updatedAt: "2026-07-02T09:00:00.000Z",
};

export const ApplicationsListExample = [
  {
    id: "capp1a2b0000ug0h9x1n1a2",
    jobId: "cjob1a2b0000ug0h9x1n1a2",
    talentId: "ctal1a2b0000ug0h9x1n1a2",
    coverLetter: "I'd love to bring my remote QA experience to this role.",
    resumeUrl: "https://cdn.remotesea.com/resumes/jane-doe.pdf",
    status: "PENDING",
    notes: null,
    appliedAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T09:00:00.000Z",
    job: {
      id: "cjob1a2b0000ug0h9x1n1a2",
      title: "Senior Backend Engineer",
      slug: "senior-backend-engineer",
      jobType: "FULL_TIME",
      level: "SENIOR",
      salaryMin: 90000,
      salaryMax: 130000,
      currency: "USD",
      isRemote: true,
      country: "Vietnam",
      status: "ACTIVE",
      employer: {
        companyName: "Acme Corp",
        logoUrl: "https://cdn.remotesea.com/logos/acme.png",
        slug: "acme-corp",
      },
      skills: [
        {
          skill: {
            id: "cskl1a2b0000ug0h9x1n1a2",
            name: "TypeScript",
            slug: "typescript",
          },
          isRequired: true,
        },
      ],
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
  },
];

export const EmptyApplicationsListExample: unknown[] = [];

export const ValidationErrorExample = {
  error: { formErrors: [], fieldErrors: { jobId: ["Invalid cuid"] } },
};
