import { z } from "zod";

export const createEmployerProfileSchema = z.object({
  companyName: z.string().min(2).max(100),
  websiteUrl: z.string().url().optional(),
  description: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  hqCountry: z.string().optional(),
  hqCity: z.string().optional(),
});

export type CreateEmployerProfileDto = z.infer<typeof createEmployerProfileSchema>;
