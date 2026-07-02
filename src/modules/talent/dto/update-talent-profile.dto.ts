import { z } from "zod";

export const talentProfileSchema = z.object({
  headline: z.string().max(120).optional(),
  bio: z.string().max(2000).optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  yearsExperience: z.number().int().min(0).optional(),
  level: z.enum(["ENTRY", "MID", "SENIOR", "LEAD", "EXECUTIVE"]).optional(),
  resumeUrl: z.string().url().optional(),
  portfolioUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  isOpenToWork: z.boolean().optional(),
  desiredSalaryMin: z.number().int().positive().optional(),
  desiredSalaryMax: z.number().int().positive().optional(),
  skills: z
    .array(z.object({ skillId: z.string().cuid(), yearsExp: z.number().int().min(0).optional() }))
    .optional(),
});

export type TalentProfileDto = z.infer<typeof talentProfileSchema>;
