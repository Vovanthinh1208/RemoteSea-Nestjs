import { z } from "zod";

export const createAlertSchema = z.object({
  name: z.string().min(1).max(100),
  keywords: z.string().max(200).optional(),
  jobType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"]).optional(),
  level: z.enum(["ENTRY", "MID", "SENIOR", "LEAD", "EXECUTIVE"]).optional(),
  salaryMin: z.number().int().positive().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  frequency: z.enum(["IMMEDIATE", "DAILY", "WEEKLY"]).default("DAILY"),
  categoryIds: z.array(z.string().cuid()).optional(),
});

export type CreateAlertDto = z.infer<typeof createAlertSchema>;
