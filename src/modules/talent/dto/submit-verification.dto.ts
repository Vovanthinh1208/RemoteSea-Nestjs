import { z } from "zod";
import { emailSchema } from "@/common/dto/email.schema";

export const submitVerificationSchema = z.object({
  email: emailSchema,
});

export type SubmitVerificationDto = z.infer<typeof submitVerificationSchema>;
