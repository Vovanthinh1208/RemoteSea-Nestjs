import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Interview Scorecards module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs.
 */

const SCORECARD_RECOMMENDATION_VALUES = [
  "STRONG_YES",
  "YES",
  "NO",
  "STRONG_NO",
] as const;

export class CreateScorecardRequestDto {
  @ApiProperty({
    enum: SCORECARD_RECOMMENDATION_VALUES,
    example: "STRONG_YES",
  })
  recommendation!: (typeof SCORECARD_RECOMMENDATION_VALUES)[number];

  @ApiPropertyOptional({
    example: "Sharp on system design, weak on the behavioral round.",
  })
  note?: string;
}

export class ScorecardAuthorDto {
  @ApiPropertyOptional({ nullable: true, example: "Nguyen Van B" })
  name!: string | null;
}

export class ScorecardResponseDto {
  @ApiProperty({ example: "csc1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "cusr1a2b0000ug0h9x1n1a2" })
  authorId!: string;

  @ApiProperty({ type: ScorecardAuthorDto })
  author!: ScorecardAuthorDto;

  @ApiProperty({
    enum: SCORECARD_RECOMMENDATION_VALUES,
    example: "STRONG_YES",
  })
  recommendation!: (typeof SCORECARD_RECOMMENDATION_VALUES)[number];

  @ApiPropertyOptional({
    nullable: true,
    example: "Sharp on system design, weak on the behavioral round.",
  })
  note!: string | null;

  @ApiProperty({ format: "date-time", example: "2026-08-19T09:12:00.000Z" })
  createdAt!: string;
}

export class ScorecardSummaryDto {
  @ApiProperty({ example: 4 })
  total!: number;

  @ApiProperty({ example: 3 })
  hireCount!: number;
}

export class ScorecardListResponseDto {
  @ApiProperty({ type: [ScorecardResponseDto] })
  scorecards!: ScorecardResponseDto[];

  @ApiProperty({ type: ScorecardSummaryDto })
  summary!: ScorecardSummaryDto;
}
