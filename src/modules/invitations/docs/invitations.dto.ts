import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Invitations module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs.
 */

const STATUSES = ["PENDING", "ACCEPTED", "DECLINED"] as const;

export class SendInvitationRequestDto {
  @ApiProperty({ example: "cjob1a2b0000ug0h9x1n1a2" })
  jobId!: string;

  @ApiProperty({ example: "clx4talent0001abcd" })
  talentId!: string;

  @ApiPropertyOptional({
    maxLength: 2000,
    example: "Loved your profile — would you consider applying?",
  })
  message?: string;
}

export class RespondInvitationRequestDto {
  @ApiProperty({ enum: ["ACCEPT", "DECLINE"], example: "ACCEPT" })
  action!: "ACCEPT" | "DECLINE";
}

class InvitationJobSummaryDto {
  @ApiProperty({ example: "cjob1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "Senior Backend Engineer" })
  title!: string;

  @ApiProperty({ example: "senior-backend-engineer-a1b2c3" })
  slug!: string;
}

class InvitationEmployerSummaryDto {
  @ApiProperty({ example: "Acme Corp" })
  companyName!: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  logoUrl?: string | null;

  @ApiProperty({ example: true })
  isVerified!: boolean;
}

export class InvitationResponseDto {
  @ApiProperty({ example: "cinv1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "Loved your profile — would you consider applying?",
  })
  message!: string | null;

  @ApiProperty({ enum: STATUSES, example: "PENDING" })
  status!: (typeof STATUSES)[number];

  @ApiProperty({ format: "date-time", example: "2026-08-14T09:12:00.000Z" })
  createdAt!: string;

  @ApiPropertyOptional({
    nullable: true,
    format: "date-time",
    example: null,
  })
  respondedAt!: string | null;

  @ApiProperty({ type: InvitationJobSummaryDto })
  job!: InvitationJobSummaryDto;

  @ApiProperty({ type: InvitationEmployerSummaryDto })
  employer!: InvitationEmployerSummaryDto;
}

export class RespondInvitationResponseDto {
  @ApiProperty({ enum: ["ACCEPTED", "DECLINED"], example: "ACCEPTED" })
  status!: "ACCEPTED" | "DECLINED";
}
