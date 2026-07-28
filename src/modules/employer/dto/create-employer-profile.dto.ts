import { z } from "zod";
import { httpUrlSchema } from "@/common/validation/http-url.schema";
import { trimmedString } from "@/common/validation/trimmed-string.schema";

export const createEmployerProfileSchema = z.object({
  companyName: trimmedString({ min: 2, max: 100 }),
  websiteUrl: httpUrlSchema.optional(),
  description: trimmedString({ max: 2000 }).optional(),
  industry: z.string().max(100).optional(),
  size: z.string().max(50).optional(),
  hqCountry: z.string().max(100).optional(),
  hqCity: z.string().max(100).optional(),
});

export type CreateEmployerProfileDto = z.infer<
  typeof createEmployerProfileSchema
>;
