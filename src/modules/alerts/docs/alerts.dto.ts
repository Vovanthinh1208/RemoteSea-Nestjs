import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  JOB_TYPE_VALUES,
  EXPERIENCE_LEVEL_VALUES,
  ALERT_FREQUENCY_VALUES,
} from "@/common/constants/enum-values.constants";

/**
 * Swagger-only request/response shapes for the Alerts module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

export class CreateAlertRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 100, example: "Remote React Jobs" })
  name!: string;

  @ApiPropertyOptional({ maxLength: 200, example: "react typescript" })
  keywords?: string;

  @ApiPropertyOptional({ enum: JOB_TYPE_VALUES, example: "FULL_TIME" })
  jobType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "FREELANCE";

  @ApiPropertyOptional({ enum: EXPERIENCE_LEVEL_VALUES, example: "SENIOR" })
  level?: "ENTRY" | "MID" | "SENIOR" | "LEAD" | "EXECUTIVE";

  @ApiPropertyOptional({ type: Number, minimum: 1, example: 80000, description: "Matches jobs with salaryMin >= value" })
  salaryMin?: number;

  @ApiPropertyOptional({ example: "United States" })
  country?: string;

  @ApiPropertyOptional({ example: "America/New_York", description: "Stored only, not used in matching" })
  timezone?: string;

  @ApiPropertyOptional({ enum: ALERT_FREQUENCY_VALUES, default: "DAILY", example: "DAILY" })
  frequency?: "IMMEDIATE" | "DAILY" | "WEEKLY";

  @ApiPropertyOptional({ type: [String], example: ["cme8f1a2b0000ug0h9x1n1a2"] })
  categoryIds?: string[];
}

export class UpdateAlertRequestDto {
  @ApiProperty({ example: true, description: "The only mutable field on this route" })
  isActive!: boolean;
}

export class AlertCategoryDto {
  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a4" })
  id!: string;

  @ApiProperty({ example: "Engineering" })
  name!: string;

  @ApiProperty({ example: "engineering" })
  slug!: string;
}

export class AlertCategoryLinkDto {
  @ApiProperty({ type: AlertCategoryDto })
  category!: AlertCategoryDto;
}

export class AlertResponseDto {
  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a3" })
  userId!: string;

  @ApiProperty({ example: "Remote React Jobs" })
  name!: string;

  @ApiPropertyOptional({ nullable: true, example: "react typescript" })
  keywords!: string | null;

  @ApiPropertyOptional({ enum: JOB_TYPE_VALUES, nullable: true, example: "FULL_TIME" })
  jobType!: string | null;

  @ApiPropertyOptional({ enum: EXPERIENCE_LEVEL_VALUES, nullable: true, example: "SENIOR" })
  level!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 80000 })
  salaryMin!: number | null;

  @ApiPropertyOptional({ nullable: true, example: "United States" })
  country!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "America/New_York" })
  timezone!: string | null;

  @ApiProperty({ enum: ALERT_FREQUENCY_VALUES, example: "DAILY" })
  frequency!: "IMMEDIATE" | "DAILY" | "WEEKLY";

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({ nullable: true, example: "2026-07-01T10:00:00.000Z" })
  lastSentAt!: string | null;

  @ApiProperty({ example: "2026-06-01T10:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-06-01T10:00:00.000Z" })
  updatedAt!: string;

  @ApiPropertyOptional({ type: [AlertCategoryLinkDto], description: "Only included on GET/POST /alerts, not on PATCH" })
  categories?: AlertCategoryLinkDto[];
}

export class DeleteAlertResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}

export class CronDispatchResponseDto {
  @ApiProperty({ example: 42, description: "Number of active alerts scanned" })
  processed!: number;

  @ApiProperty({ example: 7, description: "Number of alerts that had matches and were emailed" })
  sent!: number;
}
