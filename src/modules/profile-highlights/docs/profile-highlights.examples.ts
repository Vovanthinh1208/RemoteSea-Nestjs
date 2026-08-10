/** Request/response example payloads for the Profile Highlights module's Swagger docs. */

export const CreatePortfolioHighlightRequestExample = {
  type: "PORTFOLIO",
  title: "Merchant onboarding flow",
  subtitle: "Lead engineer · 4 months",
  description:
    "Reworked a multi-step KYC flow into a single-page progressive form.",
  tag: "Product · Production",
  url: "https://github.com/janedoe/project",
};

export const CreateEducationHighlightRequestExample = {
  type: "EDUCATION",
  title: "University of Technology",
  subtitle: "B.Eng · Computer Science",
  startYear: 2016,
  endYear: 2020,
};

export const CreateLanguageHighlightRequestExample = {
  type: "LANGUAGE",
  title: "English",
  subtitle: "Professional working",
};

export const PortfolioHighlightResponseExample = {
  id: "cme8f1a2b0000ug0h9x1n1a2",
  talentId: "cme8f1a2b0000ug0h9x1n1a3",
  type: "PORTFOLIO",
  title: "Merchant onboarding flow",
  subtitle: "Lead engineer · 4 months",
  description:
    "Reworked a multi-step KYC flow into a single-page progressive form.",
  tag: "Product · Production",
  url: "https://github.com/janedoe/project",
  startYear: null,
  endYear: null,
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-01T10:00:00.000Z",
};

export const ProfileHighlightListResponseExample = [
  PortfolioHighlightResponseExample,
  {
    ...PortfolioHighlightResponseExample,
    id: "cme8f1a2b0000ug0h9x1n1a4",
    type: "EDUCATION",
    title: "University of Technology",
    subtitle: "B.Eng · Computer Science",
    description: null,
    tag: null,
    url: null,
    startYear: 2016,
    endYear: 2020,
  },
  {
    ...PortfolioHighlightResponseExample,
    id: "cme8f1a2b0000ug0h9x1n1a5",
    type: "LANGUAGE",
    title: "English",
    subtitle: "Professional working",
    description: null,
    tag: null,
    url: null,
    startYear: null,
    endYear: null,
  },
];

export const UpdateProfileHighlightRequestExample = {
  subtitle: "Senior engineer · 4 months",
};

export const UpdateProfileHighlightResponseExample = {
  ...PortfolioHighlightResponseExample,
  subtitle: "Senior engineer · 4 months",
  updatedAt: "2026-07-01T09:00:00.000Z",
};

export const DeleteProfileHighlightResponseExample = { success: true };

export const ProfileHighlightNotFoundExample = {
  error: "Profile highlight not found",
};

export const ProfileHighlightLimitReachedExample = {
  error:
    "You can add up to 5 portfolio entries — remove one before adding another.",
};

export const TalentProfileRequiredExample = {
  error: "Talent profile required",
};

export const ValidationErrorExample = {
  error: {
    formErrors: [],
    fieldErrors: { title: ["String must contain at least 1 character(s)"] },
  },
};
