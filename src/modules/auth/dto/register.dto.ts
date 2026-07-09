import { z } from "zod";
import { emailSchema } from "@/common/dto/email.schema";

export const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email: emailSchema,
  password: z.string().min(8).max(200),
  role: z.enum(["TALENT", "EMPLOYER"]),
});

export type RegisterDto = z.infer<typeof registerSchema>;
