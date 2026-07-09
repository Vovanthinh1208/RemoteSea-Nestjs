import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  JOB_TYPE_VALUES,
  EXPERIENCE_LEVEL_VALUES,
  JOB_STATUS_VALUES,
  APPLICATION_STATUS_VALUES,
} from "@/common/constants/enum-values.constants";

/**
 * Swagger-only request/response shapes for the Applications module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

export class ApplyRequestDto {
  @ApiProperty({
    example: "cme8f1a2b0000ug0h9x1n1a2",
    description: "CUID of the job being applied to",
  })
  jobId!: string;

  @ApiPropertyOptional({
    maxLength: 5000,
    example: "I'd love to bring my remote QA experience to this role.",
  })
  coverLetter?: string;

  @ApiPropertyOptional({
    format: "uri",
    example: "https://cdn.remotesea.com/resumes/jane-doe.pdf",
  })
  resumeUrl?: string;
}

class JobEmployerSummaryDto {
  @ApiProperty({ example: "Acme Corp" })
  companyName!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "https://cdn.remotesea.com/logos/acme.png",
  })
  logoUrl!: string | null;

  @ApiProperty({ example: "acme-corp" })
  slug!: string;
}

class JobSkillSummaryDto {
  @ApiProperty({
    example: {
      id: "cskl1a2b0000ug0h9x1n1a2",
      name: "TypeScript",
      slug: "typescript",
    },
  })
  skill!: { id: string; name: string; slug: string };

  @ApiProperty({ example: true })
  isRequired!: boolean;
}

class JobCategorySummaryDto {
  @ApiProperty({
    example: {
      id: "ccat1a2b0000ug0h9x1n1a2",
      name: "Engineering",
      slug: "engineering",
    },
  })
  category!: { id: string; name: string; slug: string };
}

class EmbeddedJobDto {
  @ApiProperty({ example: "cjob1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "Senior Backend Engineer" })
  title!: string;

  @ApiProperty({ example: "senior-backend-engineer" })
  slug!: string;

  @ApiProperty({ enum: JOB_TYPE_VALUES, example: "FULL_TIME" })
  jobType!: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "FREELANCE";

  @ApiProperty({ enum: EXPERIENCE_LEVEL_VALUES, example: "SENIOR" })
  level!: "ENTRY" | "MID" | "SENIOR" | "LEAD" | "EXECUTIVE";

  @ApiPropertyOptional({ nullable: true, example: 90000 })
  salaryMin!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 130000 })
  salaryMax!: number | null;

  @ApiProperty({ example: "USD" })
  currency!: string;

  @ApiProperty({ example: true })
  isRemote!: boolean;

  @ApiPropertyOptional({ nullable: true, example: "Vietnam" })
  country!: string | null;

  @ApiProperty({ enum: JOB_STATUS_VALUES, example: "ACTIVE" })
  status!: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "CLOSED" | "REJECTED";

  @ApiProperty({ type: JobEmployerSummaryDto })
  employer!: JobEmployerSummaryDto;

  @ApiProperty({ type: [JobSkillSummaryDto] })
  skills!: JobSkillSummaryDto[];

  @ApiProperty({ type: [JobCategorySummaryDto] })
  categories!: JobCategorySummaryDto[];
}

export class ApplicationResponseDto {
  @ApiProperty({ example: "capp1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "cjob1a2b0000ug0h9x1n1a2" })
  jobId!: string;

  @ApiProperty({ example: "ctal1a2b0000ug0h9x1n1a2" })
  talentId!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "I'd love to bring my remote QA experience to this role.",
  })
  coverLetter!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "https://cdn.remotesea.com/resumes/jane-doe.pdf",
  })
  resumeUrl!: string | null;

  @ApiProperty({
    enum: APPLICATION_STATUS_VALUES,
    example: "PENDING",
  })
  status!:
    | "PENDING"
    | "REVIEWING"
    | "SHORTLISTED"
    | "INTERVIEW"
    | "OFFERED"
    | "REJECTED"
    | "WITHDRAWN";

  @ApiPropertyOptional({ nullable: true, example: null })
  notes!: string | null;

  @ApiProperty({ example: "2026-07-02T09:00:00.000Z" })
  appliedAt!: string;

  @ApiProperty({ example: "2026-07-02T09:00:00.000Z" })
  updatedAt!: string;
}

export class ApplicationWithJobResponseDto extends ApplicationResponseDto {
  @ApiProperty({ type: EmbeddedJobDto })
  job!: EmbeddedJobDto;
}
