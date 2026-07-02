import { z } from "zod";

export const updateEmployerProfileSchema = z.object({
  companyName: z.string().min(2).max(100).optional(),
  websiteUrl: z.string().url().optional(),
  description: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  founded: z.number().int().optional(),
  hqCountry: z.string().optional(),
  hqCity: z.string().optional(),
  logoUrl: z.string().url().optional(),
});

export type UpdateEmployerProfileDto = z.infer<typeof updateEmployerProfileSchema>;
