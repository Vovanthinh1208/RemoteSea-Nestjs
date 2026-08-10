import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Profile Highlights module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

const TYPES = ["PORTFOLIO", "EDUCATION", "LANGUAGE"] as const;

export class CreateProfileHighlightRequestDto {
  @ApiProperty({ enum: TYPES, example: "PORTFOLIO" })
  type!: (typeof TYPES)[number];

  @ApiProperty({
    minLength: 1,
    maxLength: 120,
    example: "Merchant onboarding flow",
    description:
      "PORTFOLIO: project title · EDUCATION: school name · LANGUAGE: language name",
  })
  title!: string;

  @ApiPropertyOptional({
    maxLength: 120,
    example: "Lead engineer · 4 months",
    description:
      "PORTFOLIO: role · duration · EDUCATION: degree · field · LANGUAGE: proficiency level",
  })
  subtitle?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    example:
      "Reworked a multi-step KYC flow into a single-page progressive form.",
    description: "PORTFOLIO only.",
  })
  description?: string;

  @ApiPropertyOptional({
    maxLength: 60,
    example: "Product · Production",
    description: "PORTFOLIO only.",
  })
  tag?: string;

  @ApiPropertyOptional({
    format: "uri",
    example: "https://github.com/janedoe/project",
    description: "PORTFOLIO only.",
  })
  url?: string;

  @ApiPropertyOptional({
    type: Number,
    example: 2016,
    description: "EDUCATION only.",
  })
  startYear?: number;

  @ApiPropertyOptional({
    type: Number,
    example: 2020,
    description: "EDUCATION only. Omit for an ongoing program.",
  })
  endYear?: number;
}

export class UpdateProfileHighlightRequestDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  title?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  subtitle?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 60 })
  tag?: string | null;

  @ApiPropertyOptional({ nullable: true, format: "uri" })
  url?: string | null;

  @ApiPropertyOptional({ type: Number })
  startYear?: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  endYear?: number | null;
}

export class ProfileHighlightResponseDto {
  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a3" })
  talentId!: string;

  @ApiProperty({ enum: TYPES, example: "PORTFOLIO" })
  type!: (typeof TYPES)[number];

  @ApiProperty({ example: "Merchant onboarding flow" })
  title!: string;

  @ApiPropertyOptional({ nullable: true, example: "Lead engineer · 4 months" })
  subtitle!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example:
      "Reworked a multi-step KYC flow into a single-page progressive form.",
  })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "Product · Production" })
  tag!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "https://github.com/janedoe/project",
  })
  url!: string | null;

  @ApiPropertyOptional({ nullable: true, example: null })
  startYear!: number | null;

  @ApiPropertyOptional({ nullable: true, example: null })
  endYear!: number | null;

  @ApiProperty({ format: "date-time", example: "2026-06-01T10:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ format: "date-time", example: "2026-06-01T10:00:00.000Z" })
  updatedAt!: string;
}

export class DeleteProfileHighlightResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}
