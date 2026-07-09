import { z } from "zod";
import { emailSchema } from "@/common/dto/email.schema";

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
});

export type LoginDto = z.infer<typeof loginSchema>;
