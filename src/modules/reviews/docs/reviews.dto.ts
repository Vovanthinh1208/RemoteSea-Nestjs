import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Reviews module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs.
 */

const DIRECTION_VALUES = ["TALENT_TO_EMPLOYER", "EMPLOYER_TO_TALENT"] as const;

export class ReviewEligibilityResponseDto {
  @ApiProperty({ example: true })
  eligible!: boolean;

  @ApiPropertyOptional({
    enum: DIRECTION_VALUES,
    nullable: true,
    example: "TALENT_TO_EMPLOYER",
  })
  direction!: (typeof DIRECTION_VALUES)[number] | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "cemp1a2b0000ug0h9x1n1a2",
    description: "The User id of the party this caller may review",
  })
  revieweeId!: string | null;

  @ApiProperty({ example: false })
  alreadyReviewed!: boolean;
}

export class CreateReviewRequestDto {
  @ApiProperty({ example: "capp1a2b0000ug0h9x1n1a2" })
  applicationId!: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  overallRating!: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, example: 5 })
  communicationRating?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, example: 5 })
  professionalismRating?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 5,
    example: 4,
    description: "Talent reviewing an employer only",
  })
  interviewProcessRating?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 5,
    example: 4,
    description: "Employer reviewing a talent only",
  })
  reliabilityRating?: number;

  @ApiPropertyOptional({
    maxLength: 2000,
    example: "Great communication throughout the interview process.",
  })
  comment?: string;
}

export class ReviewResponseDto {
  @ApiProperty({ example: "crev1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "capp1a2b0000ug0h9x1n1a2" })
  applicationId!: string;

  @ApiProperty({ enum: DIRECTION_VALUES, example: "TALENT_TO_EMPLOYER" })
  direction!: (typeof DIRECTION_VALUES)[number];

  @ApiProperty({ example: "ctal1a2b0000ug0h9x1n1a2" })
  reviewerId!: string;

  @ApiProperty({ example: "cemp1a2b0000ug0h9x1n1a2" })
  revieweeId!: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  overallRating!: number;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 5, example: 5 })
  communicationRating!: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 5, example: 5 })
  professionalismRating!: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 5, example: 4 })
  interviewProcessRating!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    minimum: 1,
    maximum: 5,
    example: null,
  })
  reliabilityRating!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "Great communication throughout the interview process.",
  })
  comment!: string | null;

  @ApiProperty({ example: "PUBLISHED" })
  status!: string;

  @ApiProperty({ example: "2026-08-19T09:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-08-19T09:00:00.000Z" })
  updatedAt!: string;
}

class ReviewerDto {
  @ApiPropertyOptional({ nullable: true, example: "Jane Doe" })
  name!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: "Set instead of name when the reviewer is an employer",
  })
  employer!: { companyName: string } | null;
}

export class ReviewListItemDto {
  @ApiProperty({ example: "crev1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ enum: DIRECTION_VALUES, example: "TALENT_TO_EMPLOYER" })
  direction!: (typeof DIRECTION_VALUES)[number];

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  overallRating!: number;

  @ApiPropertyOptional({ nullable: true, example: 5 })
  communicationRating!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 5 })
  professionalismRating!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 4 })
  interviewProcessRating!: number | null;

  @ApiPropertyOptional({ nullable: true, example: null })
  reliabilityRating!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "Very professional and reliable throughout the process.",
  })
  comment!: string | null;

  @ApiProperty({ example: "2026-08-05T09:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ type: ReviewerDto })
  reviewer!: ReviewerDto;
}

class RatingBreakdownDto {
  @ApiPropertyOptional({ nullable: true, example: 4.9 })
  communication!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 4.8 })
  professionalism!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 4.6 })
  interviewProcess!: number | null;

  @ApiPropertyOptional({ nullable: true, example: null })
  reliability!: number | null;
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 24 })
  total!: number;

  @ApiProperty({ example: 2 })
  pages!: number;
}

export class ListUserReviewsResponseDto {
  @ApiPropertyOptional({ nullable: true, example: 4.8 })
  averageRating!: number | null;

  @ApiProperty({ example: 24 })
  totalReviews!: number;

  @ApiProperty({ type: RatingBreakdownDto })
  ratings!: RatingBreakdownDto;

  @ApiProperty({ type: [ReviewListItemDto] })
  reviews!: ReviewListItemDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}
