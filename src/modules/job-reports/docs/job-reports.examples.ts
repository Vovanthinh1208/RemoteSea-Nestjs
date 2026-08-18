/** Request/response example payloads for the Job Reports module's Swagger docs. */

export const CreateJobReportRequestExample = {
  reason: "SCAM",
  details: "Asked me to pay $200 for a 'starter laptop' before onboarding.",
};

export const CreateJobReportResponseExample = {
  id: "crep1a2b0000ug0h9x1n1a2",
  status: "OPEN",
};

export const ValidationErrorExample = {
  error: {
    formErrors: [],
    fieldErrors: { reason: ["Invalid enum value"] },
  },
};
