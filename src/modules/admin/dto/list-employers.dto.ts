import { z } from "zod";

export const listEmployersSchema = z.object({
  verified: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export type ListEmployersDto = z.infer<typeof listEmployersSchema>;
