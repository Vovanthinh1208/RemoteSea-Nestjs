import { z } from "zod";

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
