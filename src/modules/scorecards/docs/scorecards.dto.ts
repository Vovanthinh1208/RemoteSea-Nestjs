import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Interview Scorecards module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs.
 */

const SCORECARD_RECOMMENDATION_VALUES = [
  "STRONGLY_RECOMMEND",
  "RECOMMEND",
  "NEUTRAL",
  "NOT_RECOMMEND",
  "STRONGLY_NOT_RECOMMEND",
] as const;

export class CreateScorecardRequestDto {
  @ApiProperty({
    enum: SCORECARD_RECOMMENDATION_VALUES,
    example: "STRONGLY_RECOMMEND",
  })
  recommendation!: (typeof SCORECARD_RECOMMENDATION_VALUES)[number];

  @ApiProperty({ minimum: 1, maximum: 5, example: 4 })
  technicalRating!: number;

  @ApiProperty({ minimum: 1, maximum: 5, example: 3 })
  communicationRating!: number;

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  cultureFitRating!: number;

  @ApiProperty({ example: "Strong system design; clear trade-off reasoning." })
  strengths!: string;

  @ApiProperty({ example: "Probe testing strategy in the next round." })
  improvements!: string;

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
    example: "STRONGLY_RECOMMEND",
  })
  recommendation!: (typeof SCORECARD_RECOMMENDATION_VALUES)[number];

  @ApiPropertyOptional({ nullable: true, example: 4 })
  technicalRating!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 3 })
  communicationRating!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 5 })
  cultureFitRating!: number | null;

  @ApiPropertyOptional({ nullable: true })
  strengths!: string | null;

  @ApiPropertyOptional({ nullable: true })
  improvements!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "Sharp on system design, weak on the behavioral round.",
  })
  note!: string | null;

  @ApiProperty({ format: "date-time", example: "2026-08-19T09:12:00.000Z" })
  createdAt!: string;
}

export class ScorecardAveragesDto {
  @ApiPropertyOptional({ nullable: true, example: 4 })
  technical!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 3.5 })
  communication!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 4.5 })
  cultureFit!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 4 })
  overall!: number | null;
}

export class ScorecardSummaryDto {
  @ApiProperty({ example: 4 })
  total!: number;

  @ApiProperty({ example: 3 })
  hireCount!: number;

  @ApiProperty({ type: ScorecardAveragesDto })
  averages!: ScorecardAveragesDto;

  @ApiProperty({
    example: {
      STRONGLY_RECOMMEND: 1,
      RECOMMEND: 1,
      NEUTRAL: 0,
      NOT_RECOMMEND: 0,
      STRONGLY_NOT_RECOMMEND: 0,
    },
  })
  recommendations!: Record<
    (typeof SCORECARD_RECOMMENDATION_VALUES)[number],
    number
  >;
}

export class ScorecardListResponseDto {
  @ApiProperty({ type: [ScorecardResponseDto] })
  scorecards!: ScorecardResponseDto[];

  @ApiProperty({ type: ScorecardSummaryDto })
  summary!: ScorecardSummaryDto;
}
