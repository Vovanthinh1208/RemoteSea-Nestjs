import { z } from "zod";
import { httpUrlSchema } from "@/common/validation/http-url.schema";
import { trimmedString } from "@/common/validation/trimmed-string.schema";

// PB30 AC2: company name, official website, headcount, HQ country and a
// short description are all required to complete onboarding.
export const createEmployerProfileSchema = z.object({
  companyName: trimmedString({ min: 2, max: 100 }),
  websiteUrl: httpUrlSchema,
  description: trimmedString({ min: 1, max: 2000 }),
  industry: z.string().max(100).optional(),
  size: trimmedString({ min: 1, max: 50 }),
  hqCountry: trimmedString({ min: 1, max: 100 }),
  hqCity: z.string().max(100).optional(),
});

export type CreateEmployerProfileDto = z.infer<
  typeof createEmployerProfileSchema
>;
