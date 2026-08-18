import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Job Reports module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs.
 */

const REASONS = [
  "SCAM",
  "MISLEADING",
  "ALREADY_FILLED",
  "DISCRIMINATORY",
  "DUPLICATE",
  "OTHER",
] as const;

export class CreateJobReportRequestDto {
  @ApiProperty({ enum: REASONS, example: "SCAM" })
  reason!: (typeof REASONS)[number];

  @ApiPropertyOptional({
    maxLength: 2000,
    example: "Asked me to pay $200 for a 'starter laptop' before onboarding.",
  })
  details?: string;
}

export class CreateJobReportResponseDto {
  @ApiProperty({ example: "crep1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "OPEN" })
  status!: "OPEN";
}
