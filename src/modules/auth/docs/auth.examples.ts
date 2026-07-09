/** Request/response example payloads for the Auth module's Swagger docs. */

export const RegisterRequestExample = {
  name: "Jane Doe",
  email: "jane.doe@example.com",
  password: "SuperSecret123",
  role: "TALENT",
};

export const RegisterResponseExample = {
  id: "cme8f1a2b0000ug0h9x1n1a2",
  email: "jane.doe@example.com",
  name: "Jane Doe",
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
