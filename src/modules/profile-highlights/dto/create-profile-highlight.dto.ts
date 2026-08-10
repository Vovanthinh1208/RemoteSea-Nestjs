import { z } from "zod";
import { trimmedString } from "@/common/validation/trimmed-string.schema";
import { httpUrlSchema } from "@/common/validation/http-url.schema";

const CURRENT_YEAR = new Date().getUTCFullYear();

const portfolioHighlightSchema = z.object({
  type: z.literal("PORTFOLIO"),
  title: trimmedString({ min: 1, max: 120 }),
  subtitle: trimmedString({ max: 120 }).optional(),
  description: trimmedString({ max: 500 }).optional(),
  tag: trimmedString({ max: 60 }).optional(),
  url: httpUrlSchema.optional(),
});

const educationHighlightSchema = z.object({
  type: z.literal("EDUCATION"),
  title: trimmedString({ min: 1, max: 120 }), // school name
  subtitle: trimmedString({ max: 120 }).optional(), // degree · field of study
  startYear: z
    .number()
    .int()
    .min(1950)
    .max(CURRENT_YEAR + 1),
  // Omitted = ongoing.
  endYear: z
    .number()
    .int()
    .min(1950)
    .max(CURRENT_YEAR + 10)
    .optional(),
});

const languageHighlightSchema = z.object({
  type: z.literal("LANGUAGE"),
  title: trimmedString({ min: 1, max: 60 }), // language name
  subtitle: trimmedString({ max: 60 }).optional(), // proficiency level
});

export const createProfileHighlightSchema = z
  .discriminatedUnion("type", [
    portfolioHighlightSchema,
    educationHighlightSchema,
    languageHighlightSchema,
  ])
  .superRefine((data, ctx) => {
    if (
      data.type === "EDUCATION" &&
      data.endYear !== undefined &&
      data.endYear < data.startYear
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endYear must be on or after startYear",
        path: ["endYear"],
      });
    }
  });

export type CreateProfileHighlightDto = z.infer<
  typeof createProfileHighlightSchema
>;
