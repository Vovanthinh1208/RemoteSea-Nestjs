import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Jobs module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

const JOB_TYPE_VALUES = ["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"] as const;
const EXPERIENCE_LEVEL_VALUES = ["ENTRY", "MID", "SENIOR", "LEAD", "EXECUTIVE"] as const;
const PLAN_TYPE_VALUES = ["STANDARD", "FEATURED", "HANDS_ON"] as const;
const JOB_STATUS_VALUES = ["DRAFT", "PENDING_REVIEW", "ACTIVE", "CLOSED", "REJECTED"] as const;

export class CreateJobRequestDto {
  @ApiProperty({ minLength: 5, maxLength: 120, example: "Senior Backend Engineer" })
  title!: string;

  @ApiProperty({ minLength: 100, example: "We are looking for a senior backend engineer to join our remote team..." })
  description!: string;

  @ApiPropertyOptional({ example: "5+ years with Node.js, PostgreSQL, and distributed systems." })
  requirements?: string;

  @ApiProperty({ enum: JOB_TYPE_VALUES, example: "FULL_TIME" })
  jobType!: (typeof JOB_TYPE_VALUES)[number];

  @ApiProperty({ enum: EXPERIENCE_LEVEL_VALUES, example: "SENIOR" })
  level!: (typeof EXPERIENCE_LEVEL_VALUES)[number];

  @ApiProperty({ type: "integer", example: 60000, description: "Positive integer" })
  salaryMin!: number;

  @ApiProperty({ type: "integer", example: 90000, description: "Positive integer; must be >= salaryMin (service-checked)" })
  salaryMax!: number;

  @ApiPropertyOptional({ example: "UTC+7" })
  timezone?: string;

  @ApiPropertyOptional({ example: "Vietnam" })
  country?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 10, default: [], example: ["Health insurance", "Remote stipend"] })
  benefits?: string[];

  @ApiProperty({ enum: PLAN_TYPE_VALUES, example: "STANDARD" })
  planType!: (typeof PLAN_TYPE_VALUES)[number];

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 3,
    example: ["clcat1a2b3c4d5e6f7g8h9i0"],
    description: "CUIDs, 1-3 items",
  })
  categoryIds!: string[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: 15,
    default: [],
    example: ["clskl1a2b3c4d5e6f7g8h9i0"],
    description: "CUIDs, max 15 items",
  })
  skillIds?: string[];
}

export class CreateJobResponseDto {
  @ApiProperty({ example: "cljob1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ example: "senior-backend-engineer-a1b2c3" })
  slug!: string;

  @ApiProperty({ enum: JOB_STATUS_VALUES, example: "DRAFT" })
  status!: (typeof JOB_STATUS_VALUES)[number];
}

export class UpdateJobRequestDto {
  @ApiPropertyOptional({ minLength: 5, maxLength: 120, example: "Senior Backend Engineer" })
  title?: string;

  @ApiPropertyOptional({ minLength: 100, example: "We are looking for a senior backend engineer to join our remote team..." })
  description?: string;

  @ApiPropertyOptional({ example: "5+ years with Node.js, PostgreSQL, and distributed systems." })
  requirements?: string;

  @ApiPropertyOptional({ enum: JOB_TYPE_VALUES, example: "FULL_TIME" })
  jobType?: (typeof JOB_TYPE_VALUES)[number];

  @ApiPropertyOptional({ enum: EXPERIENCE_LEVEL_VALUES, example: "SENIOR" })
  level?: (typeof EXPERIENCE_LEVEL_VALUES)[number];

  @ApiPropertyOptional({ type: "integer", example: 60000 })
  salaryMin?: number;

  @ApiPropertyOptional({ type: "integer", example: 90000 })
  salaryMax?: number;

  @ApiPropertyOptional({ example: "UTC+7" })
  timezone?: string;

  @ApiPropertyOptional({ example: "Vietnam" })
  country?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 10, example: ["Health insurance", "Remote stipend"] })
  benefits?: string[];

  @ApiPropertyOptional({ enum: PLAN_TYPE_VALUES, example: "STANDARD" })
  planType?: (typeof PLAN_TYPE_VALUES)[number];
}

export class JobCategoryDto {
  @ApiProperty({ example: "clcat1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ example: "Engineering" })
  name!: string;

  @ApiProperty({ example: "engineering" })
  slug!: string;

  @ApiPropertyOptional({ example: "code", nullable: true })
  icon?: string | null;
}

export class JobCategoryLinkDto {
  @ApiProperty({ type: JobCategoryDto })
  category!: JobCategoryDto;
}

export class JobSkillDto {
  @ApiProperty({ example: "clskl1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ example: "TypeScript" })
  name!: string;

  @ApiProperty({ example: "typescript" })
  slug!: string;
}

export class JobSkillLinkDto {
  @ApiProperty({ type: JobSkillDto })
  skill!: JobSkillDto;

  @ApiProperty({ example: true })
  isRequired!: boolean;
}

export class JobListEmployerDto {
  @ApiProperty({ example: "RemoteSEA Ltd" })
  companyName!: string;

  @ApiPropertyOptional({ format: "url", example: "https://remotesea.io/logo.png", nullable: true })
  logoUrl?: string | null;

  @ApiProperty({ example: "remotesea-ltd" })
  slug!: string;
}

export class JobDetailEmployerDto extends JobListEmployerDto {
  @ApiProperty({ example: false })
  isVerified!: boolean;

  @ApiPropertyOptional({ example: "51-200", nullable: true })
  size?: string | null;

  @ApiPropertyOptional({ example: "We build tools for remote teams across Southeast Asia.", nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ example: "Singapore", nullable: true })
  hqCountry?: string | null;
}

export class JobListItemDto {
  @ApiProperty({ example: "cljob1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ example: "Senior Backend Engineer" })
  title!: string;

  @ApiProperty({ example: "senior-backend-engineer-a1b2c3" })
  slug!: string;

  @ApiProperty({ example: "We are looking for a senior backend engineer to join our remote team..." })
  description!: string;

  @ApiProperty({ enum: JOB_TYPE_VALUES, example: "FULL_TIME" })
  jobType!: (typeof JOB_TYPE_VALUES)[number];

  @ApiProperty({ enum: EXPERIENCE_LEVEL_VALUES, example: "SENIOR" })
  level!: (typeof EXPERIENCE_LEVEL_VALUES)[number];

  @ApiPropertyOptional({ example: 60000, nullable: true })
  salaryMin?: number | null;

  @ApiPropertyOptional({ example: 90000, nullable: true })
  salaryMax?: number | null;

  @ApiProperty({ example: "USD" })
  currency!: string;

  @ApiProperty({ example: true })
  isRemote!: boolean;

  @ApiPropertyOptional({ example: "UTC+7", nullable: true })
  timezone?: string | null;

  @ApiPropertyOptional({ example: "Vietnam", nullable: true })
  country?: string | null;

  @ApiProperty({ enum: JOB_STATUS_VALUES, example: "ACTIVE" })
  status!: (typeof JOB_STATUS_VALUES)[number];

  @ApiProperty({ enum: PLAN_TYPE_VALUES, example: "STANDARD" })
  planType!: (typeof PLAN_TYPE_VALUES)[number];

  @ApiProperty({ type: [String], example: ["Health insurance", "Remote stipend"] })
  benefits!: string[];

  @ApiProperty({ example: false })
  isFeatured!: boolean;

  @ApiProperty({ example: 342 })
  viewCount!: number;

  @ApiProperty({ example: 12 })
  applyCount!: number;

  @ApiPropertyOptional({ example: "2026-05-01T08:00:00.000Z", nullable: true })
  publishedAt?: string | null;

  @ApiProperty({ example: "2026-04-20T08:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ type: JobListEmployerDto })
  employer!: JobListEmployerDto;

  @ApiProperty({ type: [JobCategoryLinkDto] })
  categories!: JobCategoryLinkDto[];

  @ApiProperty({ type: [JobSkillLinkDto] })
  skills!: JobSkillLinkDto[];
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 57 })
  total!: number;

  @ApiProperty({ example: 3 })
  pages!: number;
}

export class JobFacetsDto {
  @ApiProperty({
    example: { "Full-time": 41, Contract: 12, "Part-time": 4 },
    description: "Count of active jobs per job-type bucket, ignoring the caller's own filters (computed over all active jobs).",
  })
  jobType!: Record<string, number>;

  @ApiProperty({
    example: { sea: 30, async: 9, SG: 14, AU: 8, US: 5 },
    description: "Count of active jobs per timezone bucket (sea/async/SG/AU/US), ignoring the caller's own filters.",
  })
  timezone!: Record<string, number>;

  @ApiProperty({
    example: { Entry: 9, Mid: 28, Senior: 20 },
    description: "Count of active jobs per seniority bucket (Senior folds in LEAD/EXECUTIVE), ignoring the caller's own filters.",
  })
  seniority!: Record<string, number>;

  @ApiProperty({
    example: { Engineering: 24, Design: 10, Data: 7, Product: 9, Marketing: 7 },
    description: "Count of active jobs per named category, ignoring the caller's own filters.",
  })
  category!: Record<string, number>;
}

export class ListJobsResponseDto {
  @ApiProperty({ type: [JobListItemDto] })
  jobs!: JobListItemDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;

  @ApiProperty({
    type: JobFacetsDto,
    description:
      "Option counts for building a filter sidebar, always computed over ALL active jobs regardless of the filters actually applied to `jobs`/`pagination` above — matches the original app/jobs/page.tsx Server Component's facetRows behavior.",
  })
  facets!: JobFacetsDto;
}

export class JobDetailResponseDto {
  @ApiProperty({ example: "cljob1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ example: "Senior Backend Engineer" })
  title!: string;

  @ApiProperty({ example: "senior-backend-engineer-a1b2c3" })
  slug!: string;

  @ApiProperty({ example: "We are looking for a senior backend engineer to join our remote team..." })
  description!: string;

  @ApiPropertyOptional({ example: "5+ years with Node.js, PostgreSQL, and distributed systems.", nullable: true })
  requirements?: string | null;

  @ApiPropertyOptional({ nullable: true })
  responsibilities?: string | null;

  @ApiProperty({ enum: JOB_TYPE_VALUES, example: "FULL_TIME" })
  jobType!: (typeof JOB_TYPE_VALUES)[number];

  @ApiProperty({ enum: EXPERIENCE_LEVEL_VALUES, example: "SENIOR" })
  level!: (typeof EXPERIENCE_LEVEL_VALUES)[number];

  @ApiPropertyOptional({ example: 60000, nullable: true })
  salaryMin?: number | null;

  @ApiPropertyOptional({ example: 90000, nullable: true })
  salaryMax?: number | null;

  @ApiProperty({ example: "USD" })
  currency!: string;

  @ApiProperty({ example: true })
  isRemote!: boolean;

  @ApiPropertyOptional({ example: "UTC+7", nullable: true })
  timezone?: string | null;

  @ApiPropertyOptional({ example: "Vietnam", nullable: true })
  country?: string | null;

  @ApiPropertyOptional({ format: "url", nullable: true })
  applicationUrl?: string | null;

  @ApiProperty({ enum: JOB_STATUS_VALUES, example: "ACTIVE" })
  status!: (typeof JOB_STATUS_VALUES)[number];

  @ApiProperty({ enum: PLAN_TYPE_VALUES, example: "STANDARD" })
  planType!: (typeof PLAN_TYPE_VALUES)[number];

  @ApiProperty({ type: [String], example: ["Health insurance", "Remote stipend"] })
  benefits!: string[];

  @ApiPropertyOptional({ nullable: true })
  reviewNote?: string | null;

  @ApiProperty({ example: false })
  isFeatured!: boolean;

  @ApiProperty({ example: 342 })
  viewCount!: number;

  @ApiProperty({ example: 12 })
  applyCount!: number;

  @ApiPropertyOptional({ example: "2026-05-01T08:00:00.000Z", nullable: true })
  publishedAt?: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  expiresAt?: string | null;

  @ApiProperty({ example: "2026-04-20T08:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-06-01T10:00:00.000Z" })
  updatedAt!: string;

  @ApiProperty({ type: JobDetailEmployerDto })
  employer!: JobDetailEmployerDto;

  @ApiProperty({ type: [JobCategoryLinkDto] })
  categories!: JobCategoryLinkDto[];

  @ApiProperty({ type: [JobSkillLinkDto] })
  skills!: JobSkillLinkDto[];
}
