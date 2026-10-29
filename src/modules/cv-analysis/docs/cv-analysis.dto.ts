import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CV_RECOMMENDATION_VALUES } from "@/common/constants/enum-values.constants";

/**
 * Swagger-only response shape for the CV Analysis module — no request body
 * (GET, lazily computed), so unlike scorecards.dto.ts there's nothing to
 * validate, only a response to describe.
 */
export class CvAnalysisResponseDto {
  @ApiProperty({ example: "cva1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: 78, minimum: 0, maximum: 100 })
  fitScore!: number;

  @ApiProperty({
    example:
      "Strong backend generalist with 5 years of Node.js experience and a track record shipping production APIs, but no direct exposure to the GraphQL stack this role is built on.",
  })
  summary!: string;

  @ApiProperty({
    type: [String],
    example: ["5 years of Node.js/TypeScript", "Led a team of 3 engineers"],
  })
  strengths!: string[];

  @ApiProperty({
    type: [String],
    example: ["No GraphQL experience listed", "No mention of AWS"],
  })
  gaps!: string[];

  @ApiProperty({
    type: [String],
    example: ["Have you worked with GraphQL or a similar query layer before?"],
  })
  suggestedQuestions!: string[];

  @ApiPropertyOptional({
    enum: CV_RECOMMENDATION_VALUES,
    nullable: true,
    example: "PROCEED",
    description:
      "Decision support only — the recruiter always makes the actual call. Null for analyses generated before this field existed (never backfilled).",
  })
  recommendation!: "PROCEED" | "REVIEW" | "REJECT" | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "Strong technical overlap outweighs the GraphQL gap.",
  })
  recommendationReason!: string | null;

  @ApiProperty({ example: "claude-haiku-4-5-20251001" })
  model!: string;

  @ApiProperty({ format: "date-time", example: "2026-08-20T09:12:00.000Z" })
  createdAt!: string;
}
