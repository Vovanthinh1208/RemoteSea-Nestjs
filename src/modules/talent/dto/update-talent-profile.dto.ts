import { z } from "zod";
import { httpUrlSchema } from "@/common/validation/http-url.schema";
import { experienceLevelSchema } from "@/common/dto/enums.schema";
import { trimmedString } from "@/common/validation/trimmed-string.schema";

// Settings > Privacy & data "Profile visibility". PUBLIC = anyone can view
// GET /talent/:slug (today's behavior for every existing profile — see the
// schema.prisma comment on TalentProfile.visibility for why that's the
// default). VERIFIED_EMPLOYERS restricts it to a caller authenticated as an
// EmployerProfile with isVerified: true — enforced in TalentService.getPublicProfile.
export const talentVisibilitySchema = z.enum(["PUBLIC", "VERIFIED_EMPLOYERS"]);

// Profile setup "About you" / "Job preferences" — closed enums matching the
// <select>/toggle options in the remotesea design reference, same convention
// as talentVisibilitySchema and User.language/region/currencyDisplay.
export const primaryRoleSchema = z.enum([
  "Software Engineer · Frontend",
  "Software Engineer · Backend",
  "Software Engineer · Full-stack",
  "Product Designer",
  "Product Manager",
  "Data Analyst",
]);

export const rightToWorkSchema = z.enum([
  "Vietnam only",
  "Vietnam + Singapore",
  "Vietnam + Australia",
  "Open to relocation / sponsorship",
]);

export const employmentTypeSchema = z.enum([
  "FULL_TIME",
  "CONTRACT",
  "PART_TIME",
]);

export const timezoneOverlapSchema = z.enum([
  "SG_HOURS",
  "AU_HOURS",
  "ASYNC_ONLY",
]);

export const talentProfileSchema = z.object({
  headline: trimmedString({ max: 120 }).optional(),
  bio: trimmedString({ max: 2000 }).optional(),
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
  primaryRole: primaryRoleSchema.optional(),
  rightToWork: rightToWorkSchema.optional(),
  employmentTypes: z.array(employmentTypeSchema).optional(),
  timezoneOverlap: z.array(timezoneOverlapSchema).optional(),
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
