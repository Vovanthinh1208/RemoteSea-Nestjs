/** Request/response example payloads for the Talent module's Swagger docs. */

export const TalentProfileRequestExample = {
  headline: "Senior Backend Engineer",
  level: "SENIOR",
  isOpenToWork: true,
  skills: [{ skillId: "clx4skill0001node", yearsExp: 6 }],
};

const baseTalentProfile = {
  id: "clx4talent0001abcd",
  userId: "cme8f1a2b0000ug0h9x1n1a2",
  slug: "jane-doe-a1b2c3",
  headline: "Senior Backend Engineer",
  bio: "8 years building distributed systems in Go and TypeScript.",
  location: "Ho Chi Minh City",
  country: "Vietnam",
  timezone: "Asia/Ho_Chi_Minh",
  yearsExperience: 8,
  level: "SENIOR",
  resumeUrl: "https://example.com/resume.pdf",
  portfolioUrl: "https://janedoe.dev",
  githubUrl: "https://github.com/janedoe",
  linkedinUrl: "https://linkedin.com/in/janedoe",
  isOpenToWork: true,
  visibility: "PUBLIC",
  primaryRole: "Software Engineer · Frontend",
  rightToWork: "Vietnam only",
  employmentTypes: ["FULL_TIME", "CONTRACT"],
  timezoneOverlap: ["SG_HOURS", "AU_HOURS"],
  noticePeriod: "2 weeks",
  desiredSalaryMin: 90000,
  desiredSalaryMax: 130000,
  currency: "USD",
  createdAt: "2026-01-15T09:12:00.000Z",
  updatedAt: "2026-06-30T14:02:31.000Z",
  skills: [
    {
      talentId: "clx4talent0001abcd",
      skillId: "clx4skill0001node",
      yearsExp: 6,
      skill: { id: "clx4skill0001node", name: "Node.js", slug: "node-js" },
    },
  ],
  workExperiences: [
    {
      id: "cme8f1a2b0000ug0h9x1n1a5",
      talentId: "clx4talent0001abcd",
      company: "Finch Labs",
      title: "Frontend Engineer",
      location: "Singapore",
      startDate: "2023-05-01T00:00:00.000Z",
      endDate: null,
      description:
        "Built the merchant onboarding flow for Finch's payment APIs.",
      createdAt: "2026-01-15T09:12:00.000Z",
      updatedAt: "2026-01-15T09:12:00.000Z",
    },
  ],
  profileHighlights: [
    {
      id: "cme8f1a2b0000ug0h9x1n1a6",
      talentId: "clx4talent0001abcd",
      type: "PORTFOLIO",
      title: "Merchant onboarding flow",
      subtitle: "Lead engineer · 4 months",
      description:
        "Reworked a multi-step KYC flow into a single-page progressive form.",
      tag: "Product · Production",
      url: "https://github.com/janedoe/project",
      startYear: null,
      endYear: null,
      createdAt: "2026-01-15T09:12:00.000Z",
      updatedAt: "2026-01-15T09:12:00.000Z",
    },
    {
      id: "cme8f1a2b0000ug0h9x1n1a7",
      talentId: "clx4talent0001abcd",
      type: "EDUCATION",
      title: "University of Technology",
      subtitle: "B.Eng · Computer Science",
      description: null,
      tag: null,
      url: null,
      startYear: 2016,
      endYear: 2020,
      createdAt: "2026-01-15T09:12:00.000Z",
      updatedAt: "2026-01-15T09:12:00.000Z",
    },
    {
      id: "cme8f1a2b0000ug0h9x1n1a8",
      talentId: "clx4talent0001abcd",
      type: "LANGUAGE",
      title: "English",
      subtitle: "Professional working",
      description: null,
      tag: null,
      url: null,
      startYear: null,
      endYear: null,
      createdAt: "2026-01-15T09:12:00.000Z",
      updatedAt: "2026-01-15T09:12:00.000Z",
    },
  ],
};

export const OwnTalentProfileExample = {
  ...baseTalentProfile,
  user: { name: "Jane Doe" },
};

export const UpsertTalentProfileExample = { ...baseTalentProfile };

export const PublicTalentProfileOpenExample = (() => {
  const open: Record<string, unknown> = {
    ...baseTalentProfile,
    user: { name: "Jane Doe", image: "https://example.com/avatar.jpg" },
  };
  // Never part of the public response shape — enforced (visibility) or
  // conditional (salary) in TalentMapper.toPublicProfile. primaryRole/
  // rightToWork/employmentTypes/timezoneOverlap ARE part of it (see
  // interfaces.ts's publicProfileArgs) — not sensitive, so they stay.
  delete open.visibility;
  return open;
})();

export const PublicTalentProfileClosedExample = (() => {
  const closed: Record<string, unknown> = {
    ...baseTalentProfile,
    isOpenToWork: false,
    user: { name: "Jane Doe", image: "https://example.com/avatar.jpg" },
  };
  delete closed.visibility;
  delete closed.desiredSalaryMin;
  delete closed.desiredSalaryMax;
  return closed;
})();

export const ValidationErrorExample = {
  error: {
    formErrors: [],
    fieldErrors: { headline: ["String must contain at most 120 character(s)"] },
  },
};

export const ProfileNotFoundExample = { error: "Profile not found" };

export const TalentSearchExample = {
  talents: [
    {
      id: "clx4talent0001abcd",
      slug: "jane-doe-a1b2c3",
      headline: "Senior Backend Engineer",
      level: "SENIOR",
      country: "Vietnam",
      timezone: "Asia/Ho_Chi_Minh",
      yearsExperience: 8,
      desiredSalaryMin: 90000,
      desiredSalaryMax: 130000,
      currency: "USD",
      employmentTypes: ["FULL_TIME", "CONTRACT"],
      timezoneOverlap: ["SG_HOURS", "AU_HOURS"],
      noticePeriod: "2 weeks",
      updatedAt: "2026-06-30T14:02:31.000Z",
      user: { name: "Jane Doe", image: "https://example.com/avatar.jpg" },
      skills: [
        {
          skill: { id: "clx4skill0001node", name: "Node.js", slug: "node-js" },
        },
      ],
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, pages: 1 },
};

export const SubmitVerificationRequestExample = { email: "jane@example.com" };

export const SubmitVerificationResponseExample = {
  message: "Verification email sent",
};

export const ConfirmVerificationRequestExample = {
  token: "9f3c2a1b8e7d6f5a4c3b2a1908f7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5c4",
};

export const ConfirmVerificationResponseExample = { message: "Email verified" };

export const ListActivityResponseExample = {
  activity: [
    {
      id: "iv-1:confirmed",
      type: "INTERVIEW_CONFIRMED",
      title: "Interview confirmed",
      body: "Senior Backend Engineer at Acme",
      link: "/applications/clapp1a2b3c4d5e6f7g8h9i0/interview",
      createdAt: "2026-08-17T09:12:00.000Z",
    },
    {
      id: "clevt1a2b0000ug0h9x1n1a2",
      type: "APPLICATION_STATUS_CHANGED",
      title: "Shortlisted",
      body: "Senior Backend Engineer at Acme",
      link: "/talent",
      createdAt: "2026-08-16T14:00:00.000Z",
    },
  ],
};

export const ProfileViewAnalyticsExample = {
  totalViews: 128,
  uniqueViewers: 47,
  viewsToday: 3,
  viewsThisWeek: 12,
  viewsThisMonth: 40,
  daily: [{ date: "2026-10-26", views: 3 }],
  recentViewers: [
    {
      company: { name: "Acme Inc", slug: "acme-inc", logoUrl: null },
      viewedAt: "2026-10-26T08:00:00.000Z",
    },
  ],
};
