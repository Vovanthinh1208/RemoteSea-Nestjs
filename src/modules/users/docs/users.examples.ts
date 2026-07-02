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
  error: { formErrors: [], fieldErrors: { name: ["String must contain at least 1 character(s)"] } },
};

export const SocialSignInNoPasswordExample = {
  error: "Password change is not available for social sign-in accounts.",
};

export const IncorrectCurrentPasswordExample = { error: "Current password is incorrect" };
