export const JOB_TYPE_VALUES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "FREELANCE",
] as const;
export const EXPERIENCE_LEVEL_VALUES = [
  "ENTRY",
  "MID",
  "SENIOR",
  "LEAD",
  "EXECUTIVE",
] as const;
export const JOB_STATUS_VALUES = [
  "DRAFT",
  "PENDING_REVIEW",
  "ACTIVE",
  "CLOSED",
  "REJECTED",
  "EXPIRED",
] as const;
export const JOB_MODERATION_RISK_LEVEL_VALUES = [
  "LOW",
  "MEDIUM",
  "HIGH",
] as const;
export const CV_RECOMMENDATION_VALUES = ["ADVANCE", "HOLD", "REJECT"] as const;
export const APPLICATION_STATUS_VALUES = [
  "PENDING",
  "REVIEWING",
  "SHORTLISTED",
  "INTERVIEW",
  "OFFERED",
  "OFFER_ACCEPTED",
  "OFFER_DECLINED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export const PLAN_TYPE_VALUES = ["STANDARD", "FEATURED", "HANDS_ON"] as const;
export const ALERT_FREQUENCY_VALUES = ["IMMEDIATE", "DAILY", "WEEKLY"] as const;
export const JOB_REPORT_REASON_VALUES = [
  "SCAM",
  "MISLEADING",
  "ALREADY_FILLED",
  "DISCRIMINATORY",
  "DUPLICATE",
  "OTHER",
] as const;
export const JOB_REPORT_STATUS_VALUES = [
  "OPEN",
  "RESOLVED",
  "DISMISSED",
] as const;
export const ADMIN_AUDIT_TARGET_TYPE_VALUES = [
  "EMPLOYER",
  "JOB",
  "JOB_REPORT",
  "USER",
] as const;
export const USER_ROLE_VALUES = ["TALENT", "EMPLOYER", "ADMIN"] as const;
