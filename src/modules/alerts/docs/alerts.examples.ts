/** Request/response example payloads for the Alerts module's Swagger docs. */

export const CreateAlertRequestExample = {
  name: "Remote React Jobs",
  keywords: "react typescript",
  jobType: "FULL_TIME",
  level: "SENIOR",
  salaryMin: 80000,
  country: "United States",
  timezone: "America/New_York",
  frequency: "DAILY",
  categoryIds: ["cme8f1a2b0000ug0h9x1n1a2"],
};

export const AlertResponseExample = {
  id: "cme8f1a2b0000ug0h9x1n1a2",
  userId: "cme8f1a2b0000ug0h9x1n1a3",
  name: "Remote React Jobs",
  keywords: "react typescript",
  jobType: "FULL_TIME",
  level: "SENIOR",
  salaryMin: 80000,
  country: "United States",
  timezone: "America/New_York",
  frequency: "DAILY",
  isActive: true,
  lastSentAt: null,
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-01T10:00:00.000Z",
  categories: [{ category: { id: "cme8f1a2b0000ug0h9x1n1a4", name: "Engineering", slug: "engineering" } }],
};

export const AlertListResponseExample = [AlertResponseExample];

export const UpdateAlertRequestExample = { isActive: false };

export const UpdateAlertResponseExample = {
  id: "cme8f1a2b0000ug0h9x1n1a2",
  userId: "cme8f1a2b0000ug0h9x1n1a3",
  name: "Remote React Jobs",
  keywords: "react typescript",
  jobType: "FULL_TIME",
  level: "SENIOR",
  salaryMin: 80000,
  country: "United States",
  timezone: "America/New_York",
  frequency: "DAILY",
  isActive: false,
  lastSentAt: null,
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-07-01T09:00:00.000Z",
};

export const DeleteAlertResponseExample = { success: true };

export const CronDispatchResponseExample = { processed: 42, sent: 7 };

export const AlertNotFoundExample = { error: "Not found" };

export const ValidationErrorExample = {
  error: { formErrors: [], fieldErrors: { name: ["Required"] } },
};
