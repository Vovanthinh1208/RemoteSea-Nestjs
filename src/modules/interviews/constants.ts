export const RATE_LIMITS = {
  PROPOSE_INTERVIEW: { limit: 20, windowMs: 60_000 },
  CONFIRM_INTERVIEW: { limit: 20, windowMs: 60_000 },
  CANCEL_INTERVIEW: { limit: 20, windowMs: 60_000 },
} as const;

export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 180;
export const MAX_PROPOSED_SLOTS = 2;

// PB60 AC2: the meeting platforms offered on the scheduling form.
export const INTERVIEW_PLATFORMS = [
  "GOOGLE_MEET",
  "ZOOM",
  "MS_TEAMS",
  "OTHER",
] as const;

export const INTERVIEW_PLATFORM_LABELS: Record<
  (typeof INTERVIEW_PLATFORMS)[number],
  string
> = {
  GOOGLE_MEET: "Google Meet",
  ZOOM: "Zoom",
  MS_TEAMS: "Microsoft Teams",
  OTHER: "Online meeting",
};

export const INTERVIEW_TITLE_MAX_LENGTH = 120;
export const CANCEL_REASON_MIN_LENGTH = 5;
export const CANCEL_REASON_MAX_LENGTH = 1000;
