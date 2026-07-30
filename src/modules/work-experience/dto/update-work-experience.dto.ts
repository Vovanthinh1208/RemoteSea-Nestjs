import { z } from "zod";
import { trimmedString } from "@/common/validation/trimmed-string.schema";

export const updateWorkExperienceSchema = z
  .object({
    company: trimmedString({ min: 1, max: 120 }).optional(),
    title: trimmedString({ min: 1, max: 120 }).optional(),
    location: trimmedString({ max: 120 }).nullable().optional(),
    startDate: z.coerce.date().optional(),
    // null clears it back to "current role"; undefined leaves it unchanged.
    endDate: z.coerce.date().nullable().optional(),
    description: trimmedString({ max: 1000 }).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  })
  .refine(
    (data) =>
      !data.startDate || !data.endDate || data.endDate >= data.startDate,
    {
      message: "endDate must be on or after startDate",
      path: ["endDate"],
    },
  );

export type UpdateWorkExperienceDto = z.infer<
  typeof updateWorkExperienceSchema
>;
