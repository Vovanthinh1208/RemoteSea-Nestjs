import { z } from "zod";
import { trimmedString } from "@/common/validation/trimmed-string.schema";
import { httpUrlSchema } from "@/common/validation/http-url.schema";

const CURRENT_YEAR = new Date().getUTCFullYear();

// `type` is immutable after creation (not part of this schema) — the fields
// below are the union of all three highlight types' fields; which ones are
// meaningful depends on the entry's existing `type`, same trade-off as
// storing them all on one table (see schema.prisma's ProfileHighlight).
export const updateProfileHighlightSchema = z
  .object({
    title: trimmedString({ min: 1, max: 120 }).optional(),
    subtitle: trimmedString({ max: 120 }).nullable().optional(),
    description: trimmedString({ max: 500 }).nullable().optional(),
    tag: trimmedString({ max: 60 }).nullable().optional(),
    url: httpUrlSchema.nullable().optional(),
    startYear: z
      .number()
      .int()
      .min(1950)
      .max(CURRENT_YEAR + 1)
      .optional(),
    endYear: z
      .number()
      .int()
      .min(1950)
      .max(CURRENT_YEAR + 10)
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateProfileHighlightDto = z.infer<
  typeof updateProfileHighlightSchema
>;
