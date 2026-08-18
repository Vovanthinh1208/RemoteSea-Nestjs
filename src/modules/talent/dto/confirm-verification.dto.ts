import { z } from "zod";

export const confirmVerificationSchema = z.object({
  token: z.string().min(1),
});

export type ConfirmVerificationDto = z.infer<typeof confirmVerificationSchema>;
