import { z } from "zod";
import { trimmedString } from "@/common/validation/trimmed-string.schema";

export const createWorkExperienceSchema = z
  .object({
    company: trimmedString({ min: 1, max: 120 }),
    title: trimmedString({ min: 1, max: 120 }),
    location: trimmedString({ max: 120 }).optional(),
    startDate: z.coerce.date(),
    // Omitted = current role ("Present" in the UI).
    endDate: z.coerce.date().optional(),
    description: trimmedString({ max: 1000 }).optional(),
  })
  // PB24 RC2: the start date must be strictly before the end date.
  .refine((data) => !data.endDate || data.endDate > data.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

export type CreateWorkExperienceDto = z.infer<
  typeof createWorkExperienceSchema
>;
