import { z } from "zod";
import { httpUrlSchema } from "@/common/validation/http-url.schema";
import { experienceLevelSchema } from "@/common/dto/enums.schema";

// Settings > Privacy & data "Profile visibility". PUBLIC = anyone can view
// GET /talent/:slug (today's behavior for every existing profile — see the
// schema.prisma comment on TalentProfile.visibility for why that's the
// default). VERIFIED_EMPLOYERS restricts it to a caller authenticated as an
// EmployerProfile with isVerified: true — enforced in TalentService.getPublicProfile.
export const talentVisibilitySchema = z.enum(["PUBLIC", "VERIFIED_EMPLOYERS"]);

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
  visibility: talentVisibilitySchema.optional(),
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
