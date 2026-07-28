import { z } from "zod";

export const verifyTwoFactorSetupSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});
export type VerifyTwoFactorSetupDto = z.infer<
  typeof verifyTwoFactorSetupSchema
>;

export const disableTwoFactorSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
export type DisableTwoFactorDto = z.infer<typeof disableTwoFactorSchema>;

// `code` accepts either a 6-digit TOTP code or a backup code (format
// XXXXX-XXXXX — see AuthService's generateBackupCodes) — both are checked in
// AuthService.completeTwoFactorChallenge.
export const twoFactorChallengeSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().trim().min(6).max(32),
});
export type TwoFactorChallengeDto = z.infer<typeof twoFactorChallengeSchema>;
