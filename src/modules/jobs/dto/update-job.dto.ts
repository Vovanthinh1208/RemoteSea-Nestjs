import { z } from "zod";
import { jobTypeSchema, experienceLevelSchema, planTypeSchema } from "@/common/dto/enums.schema";

export const updateJobSchema = z.object({
  title: z.string().min(5).max(120).optional(),
  description: z.string().min(100).optional(),
  requirements: z.string().optional(),
  jobType: jobTypeSchema.optional(),
  level: experienceLevelSchema.optional(),
  salaryMin: z.number().int().positive().optional(),
  salaryMax: z.number().int().positive().optional(),
  timezone: z.string().optional(),
  country: z.string().optional(),
  benefits: z.array(z.string()).max(10).optional(),
  planType: planTypeSchema.optional(),
});

export type UpdateJobDto = z.infer<typeof updateJobSchema>;
