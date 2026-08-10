import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Work Experience module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

export class CreateWorkExperienceRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: "Finch Labs" })
  company!: string;

  @ApiProperty({ minLength: 1, maxLength: 120, example: "Frontend Engineer" })
  title!: string;

  @ApiPropertyOptional({ maxLength: 120, example: "Singapore" })
  location?: string;

  @ApiProperty({ format: "date-time", example: "2023-05-01T00:00:00.000Z" })
  startDate!: string;

  @ApiPropertyOptional({
    format: "date-time",
    example: null,
    description: 'Omit for a current role — rendered as "Present".',
  })
  endDate?: string;

  @ApiPropertyOptional({
    maxLength: 1000,
    example: "Built the merchant onboarding flow for Finch's payment APIs.",
  })
  description?: string;
}

export class UpdateWorkExperienceRequestDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120, example: "Finch Labs" })
  company?: string;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 120,
    example: "Frontend Engineer",
  })
  title?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 120, example: "Singapore" })
  location?: string | null;

  @ApiPropertyOptional({
    format: "date-time",
    example: "2023-05-01T00:00:00.000Z",
  })
  startDate?: string;

  @ApiPropertyOptional({
    nullable: true,
    format: "date-time",
    example: null,
    description:
      "null clears it back to a current role; omit to leave unchanged.",
  })
  endDate?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  description?: string | null;
}

export class WorkExperienceResponseDto {
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
    description: "null means this is the caller's current role.",
  })
  endDate!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "Built the merchant onboarding flow for Finch's payment APIs.",
  })
  description!: string | null;

  @ApiProperty({ format: "date-time", example: "2026-06-01T10:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ format: "date-time", example: "2026-06-01T10:00:00.000Z" })
  updatedAt!: string;
}

export class DeleteWorkExperienceResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}
