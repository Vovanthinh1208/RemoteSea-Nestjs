import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { JOB_STATUS_VALUES, PLAN_TYPE_VALUES } from "@/common/constants/enum-values.constants";

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
    enum: JOB_STATUS_VALUES,
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

  @ApiProperty({ enum: JOB_STATUS_VALUES, example: "PENDING_REVIEW" })
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
    enum: JOB_STATUS_VALUES,
    example: "ACTIVE",
    description: "Intentionally partial response — the repository only selects `status` and `publishedAt`, not a full Job object",
  })
  status!: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "CLOSED" | "REJECTED";

  @ApiPropertyOptional({ nullable: true, example: "2026-07-02T10:05:00.000Z" })
  publishedAt!: string | null;
}

export class RevenueMonthBucketDto {
  @ApiProperty({ example: "2026-07" })
  key!: string;

  @ApiProperty({ example: "Jul" })
  label!: string;

  @ApiProperty({ example: 45000, description: "Sum of PLAN_PRICES for STANDARD jobs paid this month, in cents" })
  standard!: number;

  @ApiProperty({ example: 70000, description: "Sum of PLAN_PRICES for FEATURED jobs paid this month, in cents" })
  featured!: number;

  @ApiProperty({ example: 120000, description: "Sum of PLAN_PRICES for HANDS_ON jobs paid this month, in cents" })
  handsOn!: number;
}

export class RevenuePlanMixDto {
  @ApiProperty({ enum: PLAN_TYPE_VALUES, example: "FEATURED" })
  planType!: "STANDARD" | "FEATURED" | "HANDS_ON";

  @ApiProperty({ example: "Featured listing" })
  label!: string;

  @ApiProperty({ example: 35000, description: "PLAN_PRICES[planType], in cents" })
  price!: number;

  @ApiProperty({ example: 12, description: "Count of planPaid jobs with this planType, all time" })
  count!: number;

  @ApiProperty({ example: 420000, description: "price * count, in cents" })
  amount!: number;
}

export class RevenueTransactionDto {
  @ApiProperty({ example: "cjob1a2b0000ug0h9x1n1a2" })
  jobId!: string;

  @ApiProperty({ example: "Senior Backend Engineer" })
  jobTitle!: string;

  @ApiProperty({ example: "Acme Corp" })
  companyName!: string;

  @ApiProperty({ enum: PLAN_TYPE_VALUES, example: "FEATURED" })
  planType!: "STANDARD" | "FEATURED" | "HANDS_ON";

  @ApiProperty({ example: 35000, description: "PLAN_PRICES[planType], in cents" })
  amount!: number;

  @ApiProperty({
    example: "2026-07-02T10:05:00.000Z",
    description: "Job.paidAt when available, else Job.createdAt as a fallback for jobs paid before that column existed",
  })
  paidAt!: string;
}

export class RevenueTotalsDto {
  @ApiProperty({ example: 655000, description: "Sum of PLAN_PRICES over every planPaid job, in cents" })
  allTime!: number;

  @ApiProperty({ example: 85000, description: "Sum of PLAN_PRICES for jobs paid in the current calendar month, in cents" })
  thisMonth!: number;
}

export class RevenueResponseDto {
  @ApiProperty({ type: [RevenueMonthBucketDto], description: "Last 8 calendar months, oldest first" })
  months!: RevenueMonthBucketDto[];

  @ApiProperty({ type: [RevenuePlanMixDto], description: "All-time breakdown by plan, one entry per PlanType" })
  mix!: RevenuePlanMixDto[];

  @ApiProperty({ type: [RevenueTransactionDto], description: "Most recent 10 paidAt jobs, newest first" })
  transactions!: RevenueTransactionDto[];

  @ApiProperty({ type: RevenueTotalsDto })
  totals!: RevenueTotalsDto;
}
