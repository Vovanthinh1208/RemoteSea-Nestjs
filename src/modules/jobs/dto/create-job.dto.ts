import { z } from "zod";

export const createJobSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(100),
  requirements: z.string().optional(),
  jobType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"]),
  level: z.enum(["ENTRY", "MID", "SENIOR", "LEAD", "EXECUTIVE"]),
  salaryMin: z.number().int().positive(),
  salaryMax: z.number().int().positive(),
  timezone: z.string().optional(),
  country: z.string().optional(),
  benefits: z.array(z.string()).max(10).default([]),
  planType: z.enum(["STANDARD", "FEATURED", "HANDS_ON"]),
  categoryIds: z.array(z.string().cuid()).min(1).max(3),
  skillIds: z.array(z.string().cuid()).max(15).default([]),
});

export type CreateJobDto = z.infer<typeof createJobSchema>;
