import { z } from "zod";
import { jobTypeSchema, experienceLevelSchema, alertFrequencySchema } from "@/common/dto/enums.schema";

export const createAlertSchema = z.object({
  name: z.string().min(1).max(100),
  keywords: z.string().max(200).optional(),
  jobType: jobTypeSchema.optional(),
  level: experienceLevelSchema.optional(),
  salaryMin: z.number().int().positive().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  frequency: alertFrequencySchema.default("DAILY"),
  categoryIds: z.array(z.string().cuid()).optional(),
});

export type CreateAlertDto = z.infer<typeof createAlertSchema>;
