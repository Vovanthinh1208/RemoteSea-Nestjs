import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  JOB_TYPE_VALUES,
  EXPERIENCE_LEVEL_VALUES,
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

  @ApiProperty({ example: true })
  isVerified!: boolean;
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

class ApplicationStatusEventDto {
  @ApiProperty({ enum: APPLICATION_STATUS_VALUES, example: "PENDING" })
  status!:
    | "PENDING"
    | "REVIEWING"
    | "SHORTLISTED"
    | "INTERVIEW"
    | "OFFERED"
    | "OFFER_ACCEPTED"
    | "OFFER_DECLINED"
    | "REJECTED"
    | "WITHDRAWN";

  @ApiProperty({ example: "2026-07-02T09:00:00.000Z" })
  createdAt!: string;
}

// The embedded job is the same narrow "job card" shape GET /jobs returns per
// list item (see jobListItemSelect) — key fields sketched here for /docs.
class EmbeddedJobDto {
  @ApiProperty({ example: "cjob1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "Senior Backend Engineer" })
  title!: string;

  @ApiProperty({ enum: JOB_TYPE_VALUES, example: "FULL_TIME" })
  jobType!: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "FREELANCE";

  @ApiProperty({ enum: EXPERIENCE_LEVEL_VALUES, example: "SENIOR" })
  level!: "ENTRY" | "MID" | "SENIOR" | "LEAD" | "EXECUTIVE";

  @ApiPropertyOptional({ nullable: true, example: 90000 })
  salaryMin!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 130000 })
  salaryMax!: number | null;

  @ApiProperty({ example: true })
  isRemote!: boolean;

  @ApiPropertyOptional({ nullable: true, example: "Vietnam" })
  country!: string | null;

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
    | "OFFER_ACCEPTED"
    | "OFFER_DECLINED"
    | "REJECTED"
    | "WITHDRAWN";

  @ApiProperty({ example: "2026-07-02T09:00:00.000Z" })
  appliedAt!: string;

  @ApiProperty({ example: "2026-07-02T09:00:00.000Z" })
  updatedAt!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description:
      "First time the employer's applicant list included this row — see EmployerRepository.findApplicationsForJob",
  })
  viewedAt!: string | null;

  @ApiProperty({
    type: [ApplicationStatusEventDto],
    description:
      "Full status history, oldest first — always starts with the initial PENDING event at creation. This is Application Transparency's timeline.",
  })
  statusEvents!: ApplicationStatusEventDto[];
}

export class ApplicationWithJobResponseDto extends ApplicationResponseDto {
  @ApiProperty({ type: EmbeddedJobDto })
  job!: EmbeddedJobDto;
}

export class BacklogDispatchResponseDto {
  @ApiProperty({
    example: 14,
    description: "Number of backlogged applications found this run",
  })
  processed!: number;

  @ApiProperty({
    example: 6,
    description:
      "Number of employers emailed a digest (grouped, not per-application)",
  })
  sent!: number;
}
