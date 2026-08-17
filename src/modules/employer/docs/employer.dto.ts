import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  JOB_STATUS_VALUES,
  JOB_TYPE_VALUES,
  APPLICATION_STATUS_VALUES,
  PLAN_TYPE_VALUES,
  EXPERIENCE_LEVEL_VALUES,
} from "@/common/constants/enum-values.constants";

/**
 * Swagger-only request/response shapes for the Employer module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

export class CreateEmployerProfileRequestDto {
  @ApiProperty({ minLength: 2, maxLength: 100, example: "RemoteSEA Ltd" })
  companyName!: string;

  @ApiPropertyOptional({ format: "url", example: "https://remotesea.io" })
  websiteUrl?: string;

  @ApiPropertyOptional({ example: "We help remote teams hire across SEA." })
  description?: string;

  @ApiPropertyOptional({ example: "Technology" })
  industry?: string;

  @ApiPropertyOptional({ example: "11-50" })
  size?: string;

  @ApiPropertyOptional({ example: "Vietnam" })
  hqCountry?: string;

  @ApiPropertyOptional({ example: "Ho Chi Minh City" })
  hqCity?: string;
}

export class CreateEmployerProfileResponseDto {
  @ApiProperty({ example: "clx1a2b3c4d5e6f7g8h9i0j1" })
  id!: string;

  @ApiProperty({ example: "remotesea-ltd" })
  slug!: string;

  @ApiProperty({ example: "RemoteSEA Ltd" })
  companyName!: string;
}

export class UpdateEmployerProfileRequestDto {
  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 100,
    example: "RemoteSEA Ltd",
  })
  companyName?: string;

  @ApiPropertyOptional({ format: "url", example: "https://remotesea.io" })
  websiteUrl?: string;

  @ApiPropertyOptional({ example: "We help remote teams hire across SEA." })
  description?: string;

  @ApiPropertyOptional({ example: "Technology" })
  industry?: string;

  @ApiPropertyOptional({ example: "11-50" })
  size?: string;

  @ApiPropertyOptional({ example: 2019 })
  founded?: number;

  @ApiPropertyOptional({ example: "Vietnam" })
  hqCountry?: string;

  @ApiPropertyOptional({ example: "Ho Chi Minh City" })
  hqCity?: string;

  @ApiPropertyOptional({
    format: "url",
    example: "https://remotesea.io/logo.png",
  })
  logoUrl?: string;
}

export class EmployerProfileDto {
  @ApiProperty({ example: "clx1a2b3c4d5e6f7g8h9i0j1" })
  id!: string;

  @ApiProperty({ example: "RemoteSEA Ltd" })
  companyName!: string;

  @ApiProperty({ example: "remotesea-ltd" })
  slug!: string;

  @ApiPropertyOptional({
    format: "url",
    example: "https://remotesea.io/logo.png",
    nullable: true,
  })
  logoUrl?: string | null;

  @ApiPropertyOptional({
    format: "url",
    example: "https://remotesea.io",
    nullable: true,
  })
  websiteUrl?: string | null;

  @ApiPropertyOptional({
    example: "We help remote teams hire across SEA.",
    nullable: true,
  })
  description?: string | null;

  @ApiPropertyOptional({ example: "Technology", nullable: true })
  industry?: string | null;

  @ApiPropertyOptional({ example: "11-50", nullable: true })
  size?: string | null;

  @ApiPropertyOptional({ example: 2019, nullable: true })
  founded?: number | null;

  @ApiPropertyOptional({ example: "Vietnam", nullable: true })
  hqCountry?: string | null;

  @ApiPropertyOptional({ example: "Ho Chi Minh City", nullable: true })
  hqCity?: string | null;

  @ApiProperty({ example: false })
  isVerified!: boolean;

  @ApiProperty({ example: "2026-01-05T09:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-06-01T10:00:00.000Z" })
  updatedAt!: string;
}

export class EmployerProfileJobsCountDto {
  @ApiProperty({ example: 4 })
  jobs!: number;
}

export class EmployerProfileWithStatsResponseDto extends EmployerProfileDto {
  @ApiProperty({ type: EmployerProfileJobsCountDto })
  _count!: EmployerProfileJobsCountDto;

  @ApiProperty({ example: 27 })
  totalApplications!: number;
}

export class EmployerJobApplicationsCountDto {
  @ApiProperty({ example: 12 })
  applications!: number;
}

export class EmployerJobListItemDto {
  @ApiProperty({ example: "cljob1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ example: "Senior Backend Engineer" })
  title!: string;

  @ApiProperty({ example: "senior-backend-engineer-a1b2c3" })
  slug!: string;

  @ApiProperty({ enum: JOB_STATUS_VALUES, example: "ACTIVE" })
  status!: (typeof JOB_STATUS_VALUES)[number];

  @ApiProperty({ enum: PLAN_TYPE_VALUES, example: "STANDARD" })
  planType!: (typeof PLAN_TYPE_VALUES)[number];

  @ApiProperty({ example: false })
  planPaid!: boolean;

  @ApiProperty({ example: 342 })
  viewCount!: number;

  @ApiProperty({ example: 12 })
  applyCount!: number;

  @ApiPropertyOptional({ example: "2026-05-01T08:00:00.000Z", nullable: true })
  publishedAt?: string | null;

  @ApiProperty({ example: "2026-04-20T08:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ type: EmployerJobApplicationsCountDto })
  _count!: EmployerJobApplicationsCountDto;
}

export class EmployerJobStatsDto {
  @ApiProperty({ example: 27 })
  totalApps!: number;

  @ApiProperty({ example: 5 })
  shortlisted!: number;

  @ApiProperty({
    example: 6.4,
    description: "Computed only over OFFERED applications; 0 if none",
  })
  avgTimeToHireInDays!: number;

  @ApiProperty({
    example: 18.2,
    description:
      "Average time from appliedAt to the first non-PENDING ApplicationStatusEvent (first real employer action, any status). Computed only over applications with at least one such event; 0 if none.",
  })
  avgFirstResponseHours!: number;
}

export class ListEmployerJobsResponseDto {
  @ApiProperty({ type: [EmployerJobListItemDto] })
  jobs!: EmployerJobListItemDto[];

  @ApiProperty({ type: EmployerJobStatsDto })
  stats!: EmployerJobStatsDto;
}

export class ApplicationTalentUserDto {
  @ApiProperty({ example: "Jane Doe" })
  name!: string;
}

export class ApplicationTalentSkillDto {
  @ApiProperty({ example: "clskl1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ example: "TypeScript" })
  name!: string;

  @ApiProperty({ example: "typescript" })
  slug!: string;
}

export class ApplicationTalentDto {
  @ApiProperty({ example: "cltal1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ example: "jane-doe" })
  slug!: string;

  @ApiPropertyOptional({ example: "Full-stack Developer", nullable: true })
  headline?: string | null;

  @ApiProperty({ enum: EXPERIENCE_LEVEL_VALUES, example: "SENIOR" })
  level!: (typeof EXPERIENCE_LEVEL_VALUES)[number];

  @ApiProperty({ type: ApplicationTalentUserDto })
  user!: ApplicationTalentUserDto;

  @ApiProperty({ type: [ApplicationTalentSkillDto] })
  skills!: ApplicationTalentSkillDto[];
}

export class JobApplicationListItemDto {
  @ApiProperty({ example: "clapp1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ enum: APPLICATION_STATUS_VALUES, example: "REVIEWING" })
  status!: (typeof APPLICATION_STATUS_VALUES)[number];

  @ApiProperty({ example: "2026-06-10T12:00:00.000Z" })
  appliedAt!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description:
      "First time this applicant appeared in this response — see EmployerRepository.findApplicationsForJob",
  })
  viewedAt!: string | null;

  @ApiProperty({
    example: "2026-06-10T12:00:00.000Z",
    description:
      "Only real status transitions bump this (a notes-only save doesn't)",
  })
  updatedAt!: string;

  @ApiPropertyOptional({
    example: "I would love to join your team...",
    nullable: true,
  })
  coverLetter?: string | null;

  @ApiProperty({ type: ApplicationTalentDto })
  talent!: ApplicationTalentDto;
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  pages!: number;
}

export class ListJobApplicationsResponseDto {
  @ApiProperty({ type: [JobApplicationListItemDto] })
  applications!: JobApplicationListItemDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class UpdateApplicationRequestDto {
  @ApiProperty({ enum: APPLICATION_STATUS_VALUES, example: "REVIEWING" })
  status!: (typeof APPLICATION_STATUS_VALUES)[number];

  @ApiPropertyOptional({
    maxLength: 2000,
    example: "Strong candidate, moving to interview.",
  })
  notes?: string;
}

export class ApplicationResponseDto {
  @ApiProperty({ example: "clapp1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ example: "cljob1a2b3c4d5e6f7g8h9i0" })
  jobId!: string;

  @ApiProperty({ example: "cltal1a2b3c4d5e6f7g8h9i0" })
  talentId!: string;

  @ApiPropertyOptional({
    example: "I would love to join your team...",
    nullable: true,
  })
  coverLetter?: string | null;

  @ApiPropertyOptional({ format: "url", nullable: true })
  resumeUrl?: string | null;

  @ApiProperty({ enum: APPLICATION_STATUS_VALUES, example: "REVIEWING" })
  status!: (typeof APPLICATION_STATUS_VALUES)[number];

  @ApiPropertyOptional({
    maxLength: 2000,
    example: "Strong candidate, moving to interview.",
    nullable: true,
  })
  notes?: string | null;

  @ApiProperty({ example: "2026-06-10T12:00:00.000Z" })
  appliedAt!: string;

  @ApiProperty({ example: "2026-06-15T09:30:00.000Z" })
  updatedAt!: string;
}

export class SubmitVerificationRequestDto {
  @ApiProperty({ format: "email", example: "jane@acme.com" })
  email!: string;
}

export class ConfirmVerificationRequestDto {
  @ApiProperty({ minLength: 1, example: "9f3c2a1b8e7d6f5a4c3b2a1908f7e6d5" })
  token!: string;
}

export class CompanyJobSummaryDto {
  @ApiProperty({ example: "cjob1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "Senior Backend Engineer" })
  title!: string;

  @ApiProperty({ enum: JOB_TYPE_VALUES, example: "FULL_TIME" })
  jobType!: (typeof JOB_TYPE_VALUES)[number];

  @ApiProperty({ enum: EXPERIENCE_LEVEL_VALUES, example: "SENIOR" })
  level!: (typeof EXPERIENCE_LEVEL_VALUES)[number];

  @ApiPropertyOptional({ example: 3000, nullable: true })
  salaryMin?: number | null;

  @ApiPropertyOptional({ example: 5000, nullable: true })
  salaryMax?: number | null;

  @ApiProperty({ example: "USD" })
  currency!: string;

  @ApiProperty({ example: true })
  isRemote!: boolean;

  @ApiProperty({ example: false })
  isFeatured!: boolean;

  @ApiPropertyOptional({ example: "2026-07-11T09:26:19.006Z", nullable: true })
  publishedAt?: string | null;
}

export class PublicCompanyProfileDto {
  @ApiProperty({ example: "clx1a2b3c4d5e6f7g8h9i0j1" })
  id!: string;

  @ApiProperty({
    example: "clxuser1a2b3c4d5e6f7g8h9",
    description:
      "Owning User.id — lets the frontend show an Edit link when the viewer is the owner",
  })
  userId!: string;

  @ApiProperty({ example: "RemoteSEA Ltd" })
  companyName!: string;

  @ApiProperty({ example: "remotesea-ltd" })
  slug!: string;

  @ApiPropertyOptional({
    format: "url",
    example: "https://remotesea.io/logo.png",
    nullable: true,
  })
  logoUrl?: string | null;

  @ApiPropertyOptional({
    format: "url",
    example: "https://remotesea.io",
    nullable: true,
  })
  websiteUrl?: string | null;

  @ApiPropertyOptional({
    example: "We help remote teams hire across SEA.",
    nullable: true,
  })
  description?: string | null;

  @ApiPropertyOptional({ example: "Technology", nullable: true })
  industry?: string | null;

  @ApiPropertyOptional({ example: "11-50", nullable: true })
  size?: string | null;

  @ApiPropertyOptional({ example: 2019, nullable: true })
  founded?: number | null;

  @ApiPropertyOptional({ example: "Vietnam", nullable: true })
  hqCountry?: string | null;

  @ApiPropertyOptional({ example: "Ho Chi Minh City", nullable: true })
  hqCity?: string | null;

  @ApiProperty({ example: true })
  isVerified!: boolean;

  @ApiPropertyOptional({ example: "2026-05-01T09:00:00.000Z", nullable: true })
  verifiedAt?: string | null;

  @ApiProperty({ example: "2026-01-05T09:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({
    example: 3,
    description: "Count of this company's currently ACTIVE jobs",
  })
  activeJobCount!: number;

  @ApiProperty({
    example: 12,
    description:
      "Sum of vnHireCount across every job this company has ever posted, regardless of status",
  })
  vnHireTotal!: number;

  @ApiPropertyOptional({
    example: 18.5,
    nullable: true,
    description:
      "Same sample-gated stat as GET /jobs/:id's employer.avgFirstResponseHours",
  })
  avgFirstResponseHours?: number | null;

  @ApiProperty({ type: [CompanyJobSummaryDto] })
  jobs!: CompanyJobSummaryDto[];
}

export class MessageResponseDto {
  @ApiProperty({ example: "Verification email sent" })
  message!: string;
}
