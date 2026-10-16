import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Messages module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs.
 */

export class SendMessageRequestDto {
  @ApiProperty({
    maxLength: 2000,
    example: "Does 2pm ICT Thursday work for a quick call?",
  })
  body!: string;
}

export class MessageResponseDto {
  @ApiProperty({ example: "cmsg1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "cmrxb30bh0023e9zef8nanby4" })
  senderId!: string;

  @ApiProperty({ example: "Does 2pm ICT Thursday work for a quick call?" })
  body!: string;

  @ApiProperty({ format: "date-time", example: "2026-08-18T09:12:00.000Z" })
  createdAt!: string;
}

export class ThreadResponseDto {
  @ApiProperty({ type: [MessageResponseDto] })
  messages!: MessageResponseDto[];

  @ApiProperty({ example: "Senior Backend Engineer" })
  jobTitle!: string;

  @ApiProperty({ example: "Delta Payments" })
  employerName!: string;

  @ApiPropertyOptional({ nullable: true, example: "Nguyen Van A" })
  talentName!: string | null;
}
