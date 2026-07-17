import { z } from "zod";
import { httpUrlSchema } from "@/common/validation/http-url.schema";
import { experienceLevelSchema } from "@/common/dto/enums.schema";

export const talentProfileSchema = z.object({
  headline: z.string().max(120).optional(),
  bio: z.string().max(2000).optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  yearsExperience: z.number().int().min(0).optional(),
  level: experienceLevelSchema.optional(),
  resumeUrl: httpUrlSchema.optional(),
  portfolioUrl: httpUrlSchema.optional(),
  githubUrl: httpUrlSchema.optional(),
  linkedinUrl: httpUrlSchema.optional(),
  isOpenToWork: z.boolean().optional(),
  desiredSalaryMin: z.number().int().positive().max(10_000_000).optional(),
  desiredSalaryMax: z.number().int().positive().max(10_000_000).optional(),
  skills: z
    .array(
      z.object({
        skillId: z.string().cuid(),
        yearsExp: z.number().int().min(0).optional(),
      }),
    )
    .optional(),
});

export type TalentProfileDto = z.infer<typeof talentProfileSchema>;
