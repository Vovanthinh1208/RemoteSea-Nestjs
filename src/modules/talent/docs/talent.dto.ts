import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ProfileHighlightResponseDto } from "@/modules/profile-highlights/docs/profile-highlights.dto";

/**
 * Swagger-only request/response shapes for the Talent module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

const LEVELS = ["ENTRY", "MID", "SENIOR", "LEAD", "EXECUTIVE"] as const;

const PRIMARY_ROLES = [
  "Software Engineer · Frontend",
  "Software Engineer · Backend",
  "Software Engineer · Full-stack",
  "Product Designer",
  "Product Manager",
  "Data Analyst",
] as const;

const RIGHT_TO_WORK_OPTIONS = [
  "Vietnam only",
  "Vietnam + Singapore",
  "Vietnam + Australia",
  "Open to relocation / sponsorship",
] as const;

const EMPLOYMENT_TYPES = ["FULL_TIME", "CONTRACT", "PART_TIME"] as const;

const TIMEZONE_OVERLAP_OPTIONS = [
  "SG_HOURS",
  "AU_HOURS",
  "ASYNC_ONLY",
] as const;

const NOTICE_PERIODS = [
  "Immediate",
  "2 weeks",
  "1 month",
  "2+ months",
] as const;

export class TalentSkillRequestDto {
  @ApiProperty({
    description: "CUID of an existing Skill",
    example: "clx4skill0001node",
  })
  skillId!: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, example: 6 })
  yearsExp?: number;
}

export class TalentProfileRequestDto {
  @ApiPropertyOptional({ maxLength: 120, example: "Senior Backend Engineer" })
  headline?: string;

  @ApiPropertyOptional({
    maxLength: 2000,
    example: "8 years building distributed systems in Go and TypeScript.",
  })
  bio?: string;

  @ApiPropertyOptional({ example: "Ho Chi Minh City" })
  location?: string;

  @ApiPropertyOptional({ example: "Vietnam" })
  country?: string;

  @ApiPropertyOptional({ example: "Asia/Ho_Chi_Minh" })
  timezone?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, example: 8 })
  yearsExperience?: number;

  @ApiPropertyOptional({ enum: LEVELS, example: "SENIOR" })
  level?: (typeof LEVELS)[number];

  @ApiPropertyOptional({
    format: "uri",
    example: "https://example.com/resume.pdf",
  })
  resumeUrl?: string;

  @ApiPropertyOptional({ format: "uri", example: "https://janedoe.dev" })
  portfolioUrl?: string;

  @ApiPropertyOptional({ format: "uri", example: "https://github.com/janedoe" })
  githubUrl?: string;

  @ApiPropertyOptional({
    format: "uri",
    example: "https://linkedin.com/in/janedoe",
  })
  linkedinUrl?: string;

  @ApiPropertyOptional({ example: true })
  isOpenToWork?: boolean;

  @ApiPropertyOptional({
    enum: ["PUBLIC", "VERIFIED_EMPLOYERS"],
    description:
      "Who can view GET /talent/:slug. Defaults to PUBLIC. VERIFIED_EMPLOYERS restricts it to a caller authenticated as a verified EmployerProfile — enforced in TalentService.getPublicProfile, which 404s anyone else exactly as if the slug didn't exist.",
    example: "PUBLIC",
  })
  visibility?: "PUBLIC" | "VERIFIED_EMPLOYERS";

  @ApiPropertyOptional({
    enum: PRIMARY_ROLES,
    example: "Software Engineer · Frontend",
  })
  primaryRole?: (typeof PRIMARY_ROLES)[number];

  @ApiPropertyOptional({ enum: RIGHT_TO_WORK_OPTIONS, example: "Vietnam only" })
  rightToWork?: (typeof RIGHT_TO_WORK_OPTIONS)[number];

  @ApiPropertyOptional({
    enum: EMPLOYMENT_TYPES,
    isArray: true,
    example: ["FULL_TIME", "CONTRACT"],
    description: "Replaces the entire set — not a per-item toggle.",
  })
  employmentTypes?: (typeof EMPLOYMENT_TYPES)[number][];

  @ApiPropertyOptional({
    enum: TIMEZONE_OVERLAP_OPTIONS,
    isArray: true,
    example: ["SG_HOURS", "AU_HOURS"],
    description: "Replaces the entire set — not a per-item toggle.",
  })
  timezoneOverlap?: (typeof TIMEZONE_OVERLAP_OPTIONS)[number][];

  @ApiPropertyOptional({ enum: NOTICE_PERIODS, example: "2 weeks" })
  noticePeriod?: (typeof NOTICE_PERIODS)[number];

  @ApiPropertyOptional({ type: Number, minimum: 1, example: 90000 })
  desiredSalaryMin?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, example: 130000 })
  desiredSalaryMax?: number;

  @ApiPropertyOptional({
    type: [TalentSkillRequestDto],
    description:
      "Provided → replaces the entire skill set; omitted → untouched; `[]` → clears",
  })
  skills?: TalentSkillRequestDto[];
}

export class SkillDto {
  @ApiProperty({ example: "clx4skill0001node" })
  id!: string;

  @ApiProperty({ example: "Node.js" })
  name!: string;

  @ApiProperty({ example: "node-js" })
  slug!: string;
}

export class TalentSkillDto {
  @ApiProperty({ example: "clx4talent0001abcd" })
  talentId!: string;

  @ApiProperty({ example: "clx4skill0001node" })
  skillId!: string;

  @ApiPropertyOptional({ example: 6, nullable: true })
  yearsExp!: number | null;

  @ApiProperty({ type: SkillDto })
  skill!: SkillDto;
}

export class TalentOwnerDto {
  @ApiProperty({ example: "Jane Doe" })
  name!: string;
}

export class PublicTalentOwnerDto {
  @ApiProperty({ example: "Jane Doe" })
  name!: string;

  @ApiPropertyOptional({
    example: "https://example.com/avatar.jpg",
    nullable: true,
  })
  image!: string | null;
}

export class PublicWorkExperienceDto {
  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a3" })
  talentId!: string;

  @ApiProperty({ example: "Finch Labs" })
  company!: string;

  @ApiProperty({ example: "Frontend Engineer" })
  title!: string;

  @ApiPropertyOptional({ nullable: true, example: "Singapore" })
  location!: string | null;

  @ApiProperty({ format: "date-time", example: "2023-05-01T00:00:00.000Z" })
  startDate!: string;

  @ApiPropertyOptional({
    nullable: true,
    format: "date-time",
    example: null,
    description: "null means this is a current role.",
  })
  endDate!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "Built the merchant onboarding flow for Finch's payment APIs.",
  })
  description!: string | null;

  @ApiProperty({ format: "date-time", example: "2026-01-15T09:12:00.000Z" })
  createdAt!: string;

  @ApiProperty({ format: "date-time", example: "2026-01-15T09:12:00.000Z" })
  updatedAt!: string;
}

export class TalentProfileResponseDto {
  @ApiProperty({ example: "clx4talent0001abcd" })
  id!: string;

  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a2" })
  userId!: string;

  @ApiProperty({ example: "jane-doe-a1b2c3" })
  slug!: string;

  @ApiPropertyOptional({ example: "Senior Backend Engineer", nullable: true })
  headline?: string | null;

  @ApiPropertyOptional({
    example: "8 years building distributed systems in Go and TypeScript.",
    nullable: true,
  })
  bio?: string | null;

  @ApiPropertyOptional({ example: "Ho Chi Minh City", nullable: true })
  location?: string | null;

  @ApiPropertyOptional({ example: "Vietnam", nullable: true })
  country?: string | null;

  @ApiPropertyOptional({ example: "Asia/Ho_Chi_Minh", nullable: true })
  timezone?: string | null;

  @ApiPropertyOptional({ example: 8, nullable: true })
  yearsExperience?: number | null;

  @ApiProperty({ enum: LEVELS, example: "SENIOR" })
  level!: (typeof LEVELS)[number];

  @ApiPropertyOptional({
    example: "https://example.com/resume.pdf",
    nullable: true,
  })
  resumeUrl?: string | null;

  @ApiPropertyOptional({ example: "https://janedoe.dev", nullable: true })
  portfolioUrl?: string | null;

  @ApiPropertyOptional({
    example: "https://github.com/janedoe",
    nullable: true,
  })
  githubUrl?: string | null;

  @ApiPropertyOptional({
    example: "https://linkedin.com/in/janedoe",
    nullable: true,
  })
  linkedinUrl?: string | null;

  @ApiProperty({ example: true })
  isOpenToWork!: boolean;

  @ApiProperty({
    enum: ["PUBLIC", "VERIFIED_EMPLOYERS"],
    description:
      "Not present in the public GET /talent/:slug response — own-profile only.",
    example: "PUBLIC",
  })
  visibility!: "PUBLIC" | "VERIFIED_EMPLOYERS";

  @ApiPropertyOptional({
    enum: PRIMARY_ROLES,
    nullable: true,
    example: "Software Engineer · Frontend",
    description:
      "Not sensitive — also present in the public GET /talent/:slug response.",
  })
  primaryRole?: (typeof PRIMARY_ROLES)[number] | null;

  @ApiPropertyOptional({
    enum: RIGHT_TO_WORK_OPTIONS,
    nullable: true,
    example: "Vietnam only",
    description:
      "Not sensitive — also present in the public GET /talent/:slug response.",
  })
  rightToWork?: (typeof RIGHT_TO_WORK_OPTIONS)[number] | null;

  @ApiProperty({
    enum: EMPLOYMENT_TYPES,
    isArray: true,
    example: ["FULL_TIME", "CONTRACT"],
    description:
      "Not sensitive — also present in the public GET /talent/:slug response.",
  })
  employmentTypes!: (typeof EMPLOYMENT_TYPES)[number][];

  @ApiProperty({
    enum: TIMEZONE_OVERLAP_OPTIONS,
    isArray: true,
    example: ["SG_HOURS", "AU_HOURS"],
    description:
      "Not sensitive — also present in the public GET /talent/:slug response.",
  })
  timezoneOverlap!: (typeof TIMEZONE_OVERLAP_OPTIONS)[number][];

  @ApiPropertyOptional({
    enum: NOTICE_PERIODS,
    nullable: true,
    example: "2 weeks",
    description:
      "Not sensitive — also present in the public GET /talent/:slug response.",
  })
  noticePeriod?: (typeof NOTICE_PERIODS)[number] | null;

  @ApiPropertyOptional({
    example: 90000,
    nullable: true,
    description:
      "Omitted entirely (not null) from the public `GET /talent/:slug` response when `isOpenToWork` is false",
  })
  desiredSalaryMin?: number | null;

  @ApiPropertyOptional({
    example: 130000,
    nullable: true,
    description:
      "Omitted entirely (not null) from the public `GET /talent/:slug` response when `isOpenToWork` is false",
  })
  desiredSalaryMax?: number | null;

  @ApiProperty({ example: "USD" })
  currency!: string;

  @ApiProperty({ format: "date-time", example: "2026-01-15T09:12:00.000Z" })
  createdAt!: string;

  @ApiProperty({ format: "date-time", example: "2026-06-30T14:02:31.000Z" })
  updatedAt!: string;

  @ApiProperty({ type: [TalentSkillDto] })
  skills!: TalentSkillDto[];

  @ApiProperty({
    type: [PublicWorkExperienceDto],
    description:
      "Current roles (endDate null) first, then most-recently-started first.",
  })
  workExperiences!: PublicWorkExperienceDto[];

  @ApiProperty({
    type: [ProfileHighlightResponseDto],
    description:
      "Selected work / Education / Language entries (all types together, oldest first).",
  })
  profileHighlights!: ProfileHighlightResponseDto[];

  @ApiPropertyOptional({
    type: TalentOwnerDto,
    description: "Only present on `GET /talent/me`",
  })
  user?: TalentOwnerDto;
}

export class PublicTalentProfileResponseDto {
  @ApiProperty({ example: "clx4talent0001abcd" })
  id!: string;

  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a2" })
  userId!: string;

  @ApiProperty({ example: "jane-doe-a1b2c3" })
  slug!: string;

  @ApiPropertyOptional({ example: "Senior Backend Engineer", nullable: true })
  headline?: string | null;

  @ApiPropertyOptional({
    example: "8 years building distributed systems in Go and TypeScript.",
    nullable: true,
  })
  bio?: string | null;

  @ApiPropertyOptional({ example: "Ho Chi Minh City", nullable: true })
  location?: string | null;

  @ApiPropertyOptional({ example: "Vietnam", nullable: true })
  country?: string | null;

  @ApiPropertyOptional({ example: "Asia/Ho_Chi_Minh", nullable: true })
  timezone?: string | null;

  @ApiPropertyOptional({ example: 8, nullable: true })
  yearsExperience?: number | null;

  @ApiProperty({ enum: LEVELS, example: "SENIOR" })
  level!: (typeof LEVELS)[number];

  @ApiPropertyOptional({
    example: "https://example.com/resume.pdf",
    nullable: true,
  })
  resumeUrl?: string | null;

  @ApiPropertyOptional({ example: "https://janedoe.dev", nullable: true })
  portfolioUrl?: string | null;

  @ApiPropertyOptional({
    example: "https://github.com/janedoe",
    nullable: true,
  })
  githubUrl?: string | null;

  @ApiPropertyOptional({
    example: "https://linkedin.com/in/janedoe",
    nullable: true,
  })
  linkedinUrl?: string | null;

  @ApiProperty({ example: true })
  isOpenToWork!: boolean;

  @ApiPropertyOptional({
    enum: PRIMARY_ROLES,
    nullable: true,
    example: "Software Engineer · Frontend",
  })
  primaryRole!: (typeof PRIMARY_ROLES)[number] | null;

  @ApiPropertyOptional({
    enum: RIGHT_TO_WORK_OPTIONS,
    nullable: true,
    example: "Vietnam only",
  })
  rightToWork!: (typeof RIGHT_TO_WORK_OPTIONS)[number] | null;

  @ApiProperty({
    enum: EMPLOYMENT_TYPES,
    isArray: true,
    example: ["FULL_TIME", "CONTRACT"],
  })
  employmentTypes!: (typeof EMPLOYMENT_TYPES)[number][];

  @ApiProperty({
    enum: TIMEZONE_OVERLAP_OPTIONS,
    isArray: true,
    example: ["SG_HOURS", "AU_HOURS"],
  })
  timezoneOverlap!: (typeof TIMEZONE_OVERLAP_OPTIONS)[number][];

  @ApiPropertyOptional({
    enum: NOTICE_PERIODS,
    nullable: true,
    example: "2 weeks",
  })
  noticePeriod!: (typeof NOTICE_PERIODS)[number] | null;

  @ApiPropertyOptional({
    example: 90000,
    description:
      "Present only when `isOpenToWork` is true; omitted entirely (key absent, not null) otherwise",
  })
  desiredSalaryMin?: number;

  @ApiPropertyOptional({
    example: 130000,
    description:
      "Present only when `isOpenToWork` is true; omitted entirely (key absent, not null) otherwise",
  })
  desiredSalaryMax?: number;

  @ApiProperty({ example: "USD" })
  currency!: string;

  @ApiProperty({ format: "date-time", example: "2026-01-15T09:12:00.000Z" })
  createdAt!: string;

  @ApiProperty({ format: "date-time", example: "2026-06-30T14:02:31.000Z" })
  updatedAt!: string;

  @ApiProperty({ type: [TalentSkillDto] })
  skills!: TalentSkillDto[];

  @ApiProperty({
    type: [PublicWorkExperienceDto],
    description:
      "Current roles (endDate null) first, then most-recently-started first.",
  })
  workExperiences!: PublicWorkExperienceDto[];

  @ApiProperty({
    type: [ProfileHighlightResponseDto],
    description:
      "Selected work / Education / Language entries (all types together, oldest first).",
  })
  profileHighlights!: ProfileHighlightResponseDto[];

  @ApiProperty({ type: PublicTalentOwnerDto })
  user!: PublicTalentOwnerDto;
}
