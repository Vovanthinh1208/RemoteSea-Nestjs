/** Request/response example payloads for the Work Experience module's Swagger docs. */

export const CreateWorkExperienceRequestExample = {
  company: "Finch Labs",
  title: "Frontend Engineer",
  location: "Singapore",
  startDate: "2023-05-01T00:00:00.000Z",
  description: "Built the merchant onboarding flow for Finch's payment APIs.",
};

export const WorkExperienceResponseExample = {
  id: "cme8f1a2b0000ug0h9x1n1a2",
  talentId: "cme8f1a2b0000ug0h9x1n1a3",
  company: "Finch Labs",
  title: "Frontend Engineer",
  location: "Singapore",
  startDate: "2023-05-01T00:00:00.000Z",
  endDate: null,
  description: "Built the merchant onboarding flow for Finch's payment APIs.",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-01T10:00:00.000Z",
};

export const WorkExperienceListResponseExample = [
  WorkExperienceResponseExample,
  {
    ...WorkExperienceResponseExample,
    id: "cme8f1a2b0000ug0h9x1n1a4",
    company: "Carousell",
    title: "Software Engineer",
    startDate: "2021-08-01T00:00:00.000Z",
    endDate: "2023-04-01T00:00:00.000Z",
    description:
      "Shipped the offer-and-counteroffer feature for the SG buyer-side checkout.",
  },
];

export const UpdateWorkExperienceRequestExample = {
  title: "Senior Frontend Engineer",
};

export const UpdateWorkExperienceResponseExample = {
  ...WorkExperienceResponseExample,
  title: "Senior Frontend Engineer",
  updatedAt: "2026-07-01T09:00:00.000Z",
};

export const DeleteWorkExperienceResponseExample = { success: true };

export const WorkExperienceNotFoundExample = {
  error: "Work experience not found",
};

export const WorkExperienceLimitReachedExample = {
  error: "You can list up to 5 roles — remove one before adding another.",
};

export const TalentProfileRequiredExample = {
  error: "Talent profile required",
};

export const ValidationErrorExample = {
  error: {
    formErrors: [],
    fieldErrors: { company: ["String must contain at least 1 character(s)"] },
  },
};
