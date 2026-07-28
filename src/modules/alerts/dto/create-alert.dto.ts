import { z } from "zod";
import {
  jobTypeSchema,
  experienceLevelSchema,
  alertFrequencySchema,
} from "@/common/dto/enums.schema";

export const createAlertSchema = z.object({
  name: z.string().min(1).max(100),
  keywords: z.string().max(200).optional(),
  jobType: jobTypeSchema.optional(),
  level: experienceLevelSchema.optional(),
  salaryMin: z.number().int().positive().max(10_000_000).optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  frequency: alertFrequencySchema.default("DAILY"),
  // Bounded like create-job.dto.ts's categoryIds — without a cap a client
  // could submit an arbitrarily large array, each entry becoming a nested
  // AlertCategory row on create (see AlertsRepository.create).
  categoryIds: z.array(z.string().cuid()).max(3).optional(),
});

export type CreateAlertDto = z.infer<typeof createAlertSchema>;
