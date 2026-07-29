/** Request/response example payloads for the Users module's Swagger docs. */

export const UpdateUserRequestExample = { name: "Jane A. Doe" };

export const UpdateUserResponseExample = {
  id: "cme8f1a2b0000ug0h9x1n1a2",
  name: "Jane A. Doe",
  email: "jane.doe@example.com",
};

export const DeleteAccountResponseExample = { success: true };

export const ChangePasswordRequestExample = {
  currentPassword: "SuperSecret123",
  newPassword: "NewSuperSecret456",
};

export const ChangePasswordResponseExample = { message: "Password updated" };

export const ValidationErrorExample = {
  error: {
    formErrors: [],
    fieldErrors: { name: ["String must contain at least 1 character(s)"] },
  },
};

export const SocialSignInNoPasswordExample = {
  error: "Password change is not available for social sign-in accounts.",
};

export const IncorrectCurrentPasswordExample = {
  error: "Current password is incorrect",
};

// ─── Settings > Account ────────────────────────────────────────────────────

export const AccountFieldsExample = {
  id: "cme8f1a2b0000ug0h9x1n1a2",
  phone: "+84 90 123 4567",
  language: "English",
  region: "Vietnam",
  currencyDisplay: "USD ($)",
};

export const UpdateAccountRequestExample = {
  phone: "+84 90 123 4567",
  language: "English",
};

export const EmptyAccountBodyErrorExample = {
  error: {
    formErrors: ["At least one field must be provided"],
    fieldErrors: {},
  },
};

// ─── Settings > Notifications ──────────────────────────────────────────────

export const NotificationPreferencesExample = {
  id: "clx4notifpref0001",
  userId: "cme8f1a2b0000ug0h9x1n1a2",
  applicationUpdates: true,
  employerMessages: true,
  weeklyDigest: true,
  instantMatchAlerts: true,
  productNews: false,
  tipsAndResources: true,
  browserPush: true,
  updatedAt: "2026-07-28T10:00:00.000Z",
};

export const UpdateNotificationPreferencesRequestExample = {
  productNews: true,
};

// ─── Settings > Danger zone "Pause my account" ─────────────────────────────

export const PauseStateExample = {
  id: "cme8f1a2b0000ug0h9x1n1a2",
  isPaused: false,
  pausedAt: null,
};

export const PausedStateExample = {
  id: "cme8f1a2b0000ug0h9x1n1a2",
  isPaused: true,
  pausedAt: "2026-07-28T10:00:00.000Z",
};

// ─── Settings > Privacy & data ──────────────────────────────────────────────

export const ExportDataExample = {
  exportedAt: "2026-07-28T10:00:00.000Z",
  account: {
    id: "cme8f1a2b0000ug0h9x1n1a2",
    email: "jane.doe@example.com",
    name: "Jane Doe",
    phone: null,
    role: "TALENT",
    createdAt: "2026-01-15T09:12:00.000Z",
    talent: {
      headline: "Senior Backend Engineer",
      skills: [],
      applications: [],
    },
    employer: null,
    jobAlerts: [],
  },
};

// ─── Settings > Connected accounts ─────────────────────────────────────────

export const ConnectionsListExample = [
  { provider: "google", providerAccountId: "104852384756293847561" },
  { provider: "github", providerAccountId: "8213455" },
];

export const SuccessExample = { success: true };

export const ConnectionNotFoundExample = {
  error: "That provider isn't connected to this account",
};

export const LastSignInMethodExample = {
  error:
    "Set a password or keep at least one other connected account before disconnecting this one.",
};

// ─── Settings > Security > Active sessions ─────────────────────────────────

export const SessionsListExample = [
  {
    id: "cms4iborq0003exhoppxthw5w",
    device: "Chrome on macOS",
    ip: "203.0.113.4",
    location: "Ho Chi Minh City, Vietnam",
    createdAt: "2026-07-28T10:22:38.631Z",
    lastSeenAt: "2026-07-28T10:22:38.631Z",
    current: true,
  },
  {
    id: "cms4ibppt0005exhovc4ptk20",
    device: "Safari on iOS",
    ip: "203.0.113.9",
    location: null,
    createdAt: "2026-07-28T10:22:39.857Z",
    lastSeenAt: "2026-07-28T10:25:12.001Z",
    current: false,
  },
];

export const RevokeOtherSessionsExample = { revokedCount: 2 };

export const SessionNotFoundExample = { error: "Session not found" };

export const CannotRevokeCurrentSessionExample = {
  error: "Sign out to end your current session instead of revoking it here.",
};
