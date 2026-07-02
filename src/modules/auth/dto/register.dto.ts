import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["TALENT", "EMPLOYER"]),
});

export type RegisterDto = z.infer<typeof registerSchema>;
