import { z } from "zod";
import { httpUrlSchema } from "@/common/validation/http-url.schema";
import { trimmedString } from "@/common/validation/trimmed-string.schema";

const CURRENT_YEAR = new Date().getFullYear();

// A social link must actually point at that network. null clears the field.
const socialUrl = (host: string) =>
  httpUrlSchema
    .refine((value) => {
      const hostname = new URL(value).hostname.toLowerCase();
      return hostname === host || hostname.endsWith(`.${host}`);
    }, `URL must be a ${host} link`)
    .nullable();

export const updateEmployerProfileSchema = z.object({
  companyName: trimmedString({ min: 2, max: 100 }).optional(),
  websiteUrl: httpUrlSchema.optional(),
  description: trimmedString({ max: 2000 }).optional(),
  industry: z.string().max(100).optional(),
  size: z.string().max(50).optional(),
  founded: z.number().int().min(1800).max(CURRENT_YEAR).optional(),
  hqCountry: z.string().max(100).optional(),
  hqCity: z.string().max(100).optional(),
  logoUrl: httpUrlSchema.optional(),
  // PB31 AC2–3: company settings. Each optional field accepts null to clear.
  hqAddress: trimmedString({ max: 300 }).nullable().optional(),
  benefits: z
    .array(trimmedString({ min: 1, max: 100 }))
    .max(15)
    .optional(),
  linkedinUrl: socialUrl("linkedin.com").optional(),
  facebookUrl: socialUrl("facebook.com").optional(),
  videoUrl: httpUrlSchema.nullable().optional(),
  coverImageUrl: httpUrlSchema.nullable().optional(),
});

export type UpdateEmployerProfileDto = z.infer<
  typeof updateEmployerProfileSchema
>;
