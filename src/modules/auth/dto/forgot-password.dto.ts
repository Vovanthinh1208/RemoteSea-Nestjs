import { z } from "zod";
import { emailSchema } from "@/common/dto/email.schema";

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
