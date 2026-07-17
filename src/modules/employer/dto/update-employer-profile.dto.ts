import { z } from "zod";
import { httpUrlSchema } from "@/common/validation/http-url.schema";

const CURRENT_YEAR = new Date().getFullYear();

export const updateEmployerProfileSchema = z.object({
  companyName: z.string().min(2).max(100).optional(),
  websiteUrl: httpUrlSchema.optional(),
  description: z.string().max(2000).optional(),
  industry: z.string().max(100).optional(),
  size: z.string().max(50).optional(),
  founded: z.number().int().min(1800).max(CURRENT_YEAR).optional(),
  hqCountry: z.string().max(100).optional(),
  hqCity: z.string().max(100).optional(),
  logoUrl: httpUrlSchema.optional(),
});

export type UpdateEmployerProfileDto = z.infer<
  typeof updateEmployerProfileSchema
>;
