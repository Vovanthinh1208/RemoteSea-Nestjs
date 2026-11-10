import { z } from "zod";
import {
  jobTypeSchema,
  experienceLevelSchema,
  alertFrequencySchema,
} from "@/common/dto/enums.schema";

export const updateAlertSchema = z.object({
  isActive: z.boolean().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  keywords: z.string().max(200).nullable().optional(),
  jobType: jobTypeSchema.nullable().optional(),
  level: experienceLevelSchema.nullable().optional(),
  salaryMin: z.number().int().positive().max(10_000_000).nullable().optional(),
  country: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  frequency: alertFrequencySchema.optional(),
  categoryIds: z.array(z.string().cuid()).max(3).optional(),
});

export type UpdateAlertDto = z.infer<typeof updateAlertSchema>;
