import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Interviews module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs.
 */

const INTERVIEW_STATUS_VALUES = ["PENDING", "CONFIRMED"] as const;

export class ProposeInterviewRequestDto {
  @ApiProperty({ minimum: 15, maximum: 180, example: 30 })
  durationMinutes!: number;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 2,
    example: ["2026-08-25T07:00:00.000Z", "2026-08-25T09:00:00.000Z"],
  })
  proposedSlots!: string[];

  @ApiPropertyOptional({
    format: "url",
    example: "https://meet.google.com/abc-defg-hij",
  })
  meetingUrl?: string;
}

export class ConfirmInterviewRequestDto {
  @ApiProperty({ example: "2026-08-25T07:00:00.000Z" })
  slot!: string;
}

export class InterviewResponseDto {
  @ApiProperty({ example: "cintv1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: 30 })
  durationMinutes!: number;

  @ApiProperty({
    type: [String],
    example: ["2026-08-25T07:00:00.000Z", "2026-08-25T09:00:00.000Z"],
  })
  proposedSlots!: string[];

  @ApiPropertyOptional({ nullable: true, example: null })
  confirmedSlot!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: "url",
    example: "https://meet.google.com/abc-defg-hij",
  })
  meetingUrl!: string | null;

  @ApiProperty({ enum: INTERVIEW_STATUS_VALUES, example: "PENDING" })
  status!: (typeof INTERVIEW_STATUS_VALUES)[number];

  @ApiProperty({ format: "date-time", example: "2026-08-18T09:12:00.000Z" })
  createdAt!: string;
}

export class InterviewWithHeaderResponseDto {
  @ApiPropertyOptional({ nullable: true, type: InterviewResponseDto })
  interview!: InterviewResponseDto | null;

  @ApiProperty({ example: "Senior Backend Engineer" })
  jobTitle!: string;

  @ApiProperty({ example: "Delta Payments" })
  employerName!: string;

  @ApiPropertyOptional({ nullable: true, example: "Nguyen Van A" })
  talentName!: string | null;
}
