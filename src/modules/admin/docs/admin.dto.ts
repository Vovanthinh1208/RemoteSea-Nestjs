import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Admin module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

export class ListEmployersQueryDto {
  @ApiPropertyOptional({ enum: ["true", "false"], description: "Filters on EmployerProfile.isVerified" })
  verified?: "true" | "false";

  @ApiPropertyOptional({ minimum: 1, default: 1, example: 1 })
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20, example: 20 })
  limit?: number;
}

class EmployerListItemUserDto {
  @ApiProperty({ example: "hiring@acme.com" })
  email!: string;
}

class EmployerJobCountDto {
  @ApiProperty({ example: 4 })
  jobs!: number;
}

export class EmployerListItemDto {
  @ApiProperty({ example: "clx1emp0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "Acme Corp" })
  companyName!: string;

  @ApiProperty({ example: false })
  isVerified!: boolean;

  @ApiProperty({ type: EmployerListItemUserDto })
  user!: EmployerListItemUserDto;

  @ApiProperty({ type: EmployerJobCountDto, description: "Raw Prisma `_count.jobs`" })
  _count!: EmployerJobCountDto;

  @ApiProperty({ example: 4, description: "Duplicate of `_count.jobs`, exposed as a top-level convenience field" })
  jobCount!: number;

  @ApiProperty({ example: 50000, description: "Sum of PLAN_PRICES[planType] over this employer's planPaid jobs" })
  totalSpend!: number;
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 37 })
  total!: number;

  @ApiProperty({ example: 2 })
  pages!: number;
}

export class ListEmployersResponseDto {
  @ApiProperty({ type: [EmployerListItemDto] })
  employers!: EmployerListItemDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class UpdateEmployerRequestDto {
  @ApiProperty({ enum: ["verify", "suspend"], example: "verify" })
  action!: "verify" | "suspend";
}

export class UpdateEmployerResponseDto {
  @ApiProperty({ example: true })
  success!: true;
}

export class ListJobsQueryDto {
  @ApiPropertyOptional({
    enum: ["DRAFT", "PENDING_REVIEW", "ACTIVE", "CLOSED", "REJECTED"],
    default: "PENDING_REVIEW",
    example: "PENDING_REVIEW",
  })
  status?: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "CLOSED" | "REJECTED";

  @ApiPropertyOptional({ minimum: 1, default: 1, example: 1 })
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20, example: 20 })
  limit?: number;
}

class JobListItemEmployerDto {
  @ApiProperty({ example: "Acme Corp" })
  companyName!: string;

  @ApiProperty({ example: false })
  isVerified!: boolean;

  @ApiProperty({ example: "acme-corp" })
  slug!: string;
}

class JobListItemCategoryDto {
  @ApiProperty({ example: { id: "ccat1a2b0000ug0h9x1n1a2", name: "Engineering", slug: "engineering" } })
  category!: { id: string; name: string; slug: string };
}

export class JobListItemDto {
  @ApiProperty({ example: "cjob1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "Senior Backend Engineer" })
  title!: string;

  @ApiProperty({ example: "senior-backend-engineer" })
  slug!: string;

  @ApiProperty({ enum: ["DRAFT", "PENDING_REVIEW", "ACTIVE", "CLOSED", "REJECTED"], example: "PENDING_REVIEW" })
  status!: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "CLOSED" | "REJECTED";

  @ApiProperty({ type: JobListItemEmployerDto, description: "Partial employer (no full profile)" })
  employer!: JobListItemEmployerDto;

  @ApiProperty({ type: [JobListItemCategoryDto], description: "No `skills` include on this endpoint" })
  categories!: JobListItemCategoryDto[];
}

export class ListJobsResponseDto {
  @ApiProperty({ type: [JobListItemDto] })
  jobs!: JobListItemDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class ReviewJobRequestDto {
  @ApiProperty({ enum: ["approve", "reject"], example: "approve" })
  action!: "approve" | "reject";

  @ApiPropertyOptional({ maxLength: 2000, example: "Missing salary range and job description is too vague." })
  note?: string;
}

export class ReviewJobResponseDto {
  @ApiProperty({
    enum: ["DRAFT", "PENDING_REVIEW", "ACTIVE", "CLOSED", "REJECTED"],
    example: "ACTIVE",
    description: "Intentionally partial response — the repository only selects `status` and `publishedAt`, not a full Job object",
  })
  status!: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "CLOSED" | "REJECTED";

  @ApiPropertyOptional({ nullable: true, example: "2026-07-02T10:05:00.000Z" })
  publishedAt!: string | null;
}
