import { z } from "zod";

export const updateJobSchema = z.object({
  title: z.string().min(5).max(120).optional(),
  description: z.string().min(100).optional(),
  requirements: z.string().optional(),
  jobType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"]).optional(),
  level: z.enum(["ENTRY", "MID", "SENIOR", "LEAD", "EXECUTIVE"]).optional(),
  salaryMin: z.number().int().positive().optional(),
  salaryMax: z.number().int().positive().optional(),
  timezone: z.string().optional(),
  country: z.string().optional(),
  benefits: z.array(z.string()).max(10).optional(),
  planType: z.enum(["STANDARD", "FEATURED", "HANDS_ON"]).optional(),
});

export type UpdateJobDto = z.infer<typeof updateJobSchema>;
