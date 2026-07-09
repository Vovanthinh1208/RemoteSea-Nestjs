import { z } from "zod";

export const createEmployerProfileSchema = z.object({
  companyName: z.string().min(2).max(100),
  websiteUrl: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  industry: z.string().max(100).optional(),
  size: z.string().max(50).optional(),
  hqCountry: z.string().max(100).optional(),
  hqCity: z.string().max(100).optional(),
});

export type CreateEmployerProfileDto = z.infer<
  typeof createEmployerProfileSchema
>;
