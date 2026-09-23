/** Request/response example payloads for the Auth module's Swagger docs. */

export const RegisterRequestExample = {
  name: "Jane Doe",
  email: "jane.doe@example.com",
  password: "SuperSecret123",
  role: "TALENT",
};

export const LoginRequestExample = {
  email: "jane.doe@example.com",
  password: "SuperSecret123",
};

export const TokenResponseExample = {
  accessToken:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWU4ZjFhMmIwMDAwdWcwaDl4MW4xYTIifQ.signature",
};

// Register/login/2FA-challenge success shape — token + user bundled together.
export const AuthTokenResponseExample = {
  accessToken:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWU4ZjFhMmIwMDAwdWcwaDl4MW4xYTIifQ.signature",
  user: {
    id: "cme8f1a2b0000ug0h9x1n1a2",
    email: "jane.doe@example.com",
    name: "Jane Doe",
    role: "TALENT",
  },
};

export const SessionAuthenticatedExample = {
  user: {
    id: "cme8f1a2b0000ug0h9x1n1a2",
    email: "jane.doe@example.com",
    name: "Jane Doe",
    role: "TALENT",
  },
};

export const SessionAnonymousExample = { user: null };

export const ForgotPasswordRequestExample = { email: "jane.doe@example.com" };

export const ForgotPasswordResponseExample = {
  message: "If that email exists, a reset link was sent.",
};

export const ResetPasswordRequestExample = {
  token: "9f3c2a1b8e7d6f5a4c3b2a1908f7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5c4",
  password: "NewSuperSecret456",
};

export const ResetPasswordResponseExample = { message: "Password updated" };

export const ValidationErrorExample = {
  error: { formErrors: [], fieldErrors: { email: ["Invalid email"] } },
};

// ─── 2FA ────────────────────────────────────────────────────────────────────

export const TwoFactorRequiredExample = {
  twoFactorRequired: true,
  challengeToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
};

export const TwoFactorChallengeRequestExample = {
  challengeToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  code: "123456",
};

export const TwoFactorStatusDisabledExample = { enabled: false };
export const TwoFactorStatusEnabledExample = { enabled: true };

export const TwoFactorSetupExample = {
  secret: "JBSWY3DPEHPK3PXP",
  otpauthUrl:
    "otpauth://totp/RemoteSEA:jane.doe%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=RemoteSEA",
  qrCodeDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
};

export const VerifyTwoFactorSetupRequestExample = { token: "123456" };

export const VerifyTwoFactorSetupResponseExample = {
  backupCodes: ["A1B2C-D3E4F", "E9E55-7B3A1", "2F85F-E2047", "56A87-6F82F"],
};

export const TwoFactorSetupRequiredExample = {
  error: "Start two-factor setup first",
};
export const InvalidTwoFactorCodeExample = { error: "Invalid code" };
export const InvalidChallengeTokenExample = {
  error: "This code has expired — please sign in again",
};

export const DisableTwoFactorRequestExample = { password: "SuperSecret123" };
export const DisableTwoFactorResponseExample = {
  message: "Two-factor authentication disabled",
};
export const IncorrectPasswordExample = { error: "Incorrect password" };

// ─── Settings > Connected accounts "Connect" ───────────────────────────────

export const OAuthLinkUrlExample = {
  url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=code&scope=email+profile&state=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
};
