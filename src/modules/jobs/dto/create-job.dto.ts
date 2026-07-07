import { z } from "zod";
import { jobTypeSchema, experienceLevelSchema, planTypeSchema } from "@/common/dto/enums.schema";

export const createJobSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(100),
  requirements: z.string().optional(),
  jobType: jobTypeSchema,
  level: experienceLevelSchema,
  salaryMin: z.number().int().positive(),
  salaryMax: z.number().int().positive(),
  timezone: z.string().optional(),
  country: z.string().optional(),
  benefits: z.array(z.string()).max(10).default([]),
  planType: planTypeSchema,
  categoryIds: z.array(z.string().cuid()).min(1).max(3),
  skillIds: z.array(z.string().cuid()).max(15).default([]),
});

export type CreateJobDto = z.infer<typeof createJobSchema>;
