import { z } from "zod";
import {
  jobTypeSchema,
  experienceLevelSchema,
  planTypeSchema,
} from "@/common/dto/enums.schema";

export const updateJobSchema = z.object({
  title: z.string().min(5).max(120).optional(),
  description: z.string().min(100).max(20_000).optional(),
  requirements: z.string().max(10_000).optional(),
  jobType: jobTypeSchema.optional(),
  level: experienceLevelSchema.optional(),
  salaryMin: z.number().int().positive().max(10_000_000).optional(),
  salaryMax: z.number().int().positive().max(10_000_000).optional(),
  timezone: z.string().optional(),
  country: z.string().optional(),
  benefits: z.array(z.string()).max(10).optional(),
  planType: planTypeSchema.optional(),
});

export type UpdateJobDto = z.infer<typeof updateJobSchema>;
