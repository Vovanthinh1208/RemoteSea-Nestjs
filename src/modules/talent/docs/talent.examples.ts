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
};

export const OwnTalentProfileExample = {
  ...baseTalentProfile,
  user: { name: "Jane Doe" },
};

export const UpsertTalentProfileExample = { ...baseTalentProfile };

export const PublicTalentProfileOpenExample = {
  ...baseTalentProfile,
  user: { name: "Jane Doe", image: "https://example.com/avatar.jpg" },
};

export const PublicTalentProfileClosedExample = (() => {
  const closed: Record<string, unknown> = {
    ...baseTalentProfile,
    isOpenToWork: false,
    user: { name: "Jane Doe", image: "https://example.com/avatar.jpg" },
  };
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
