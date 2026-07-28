import { z } from "zod";
import {
  jobTypeSchema,
  experienceLevelSchema,
  planTypeSchema,
} from "@/common/dto/enums.schema";
import { trimmedString } from "@/common/validation/trimmed-string.schema";

export const createJobSchema = z.object({
  title: trimmedString({ min: 5, max: 120 }),
  description: trimmedString({ min: 100, max: 20_000 }),
  requirements: trimmedString({ max: 10_000 }).optional(),
  jobType: jobTypeSchema,
  level: experienceLevelSchema,
  salaryMin: z.number().int().positive().max(10_000_000),
  salaryMax: z.number().int().positive().max(10_000_000),
  timezone: z.string().optional(),
  country: z.string().optional(),
  benefits: z.array(z.string()).max(10).default([]),
  planType: planTypeSchema,
  categoryIds: z.array(z.string().cuid()).min(1).max(3),
  skillIds: z.array(z.string().cuid()).max(15).default([]),
});

export type CreateJobDto = z.infer<typeof createJobSchema>;
