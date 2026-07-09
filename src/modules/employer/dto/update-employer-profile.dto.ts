import { z } from "zod";

const CURRENT_YEAR = new Date().getFullYear();

export const updateEmployerProfileSchema = z.object({
  companyName: z.string().min(2).max(100).optional(),
  websiteUrl: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  industry: z.string().max(100).optional(),
  size: z.string().max(50).optional(),
  founded: z.number().int().min(1800).max(CURRENT_YEAR).optional(),
  hqCountry: z.string().max(100).optional(),
  hqCity: z.string().max(100).optional(),
  logoUrl: z.string().url().optional(),
});

export type UpdateEmployerProfileDto = z.infer<
  typeof updateEmployerProfileSchema
>;
