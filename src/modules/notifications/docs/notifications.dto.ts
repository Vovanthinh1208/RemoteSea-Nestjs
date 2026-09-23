import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Notifications module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs.
 */

const TYPES = [
  "INVITATION_RECEIVED",
  "APPLICATION_STATUS_CHANGED",
  "JOB_REPORT_RESOLVED",
] as const;

export class NotificationDto {
  @ApiProperty({ example: "cnot1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ enum: TYPES, example: "APPLICATION_STATUS_CHANGED" })
  type!: (typeof TYPES)[number];

  @ApiProperty({ example: "Your application status changed" })
  title!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "Your application for Senior Backend Engineer is now Shortlisted.",
  })
  body!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "/talent" })
  link!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: "date-time",
    example: null,
  })
  readAt!: string | null;

  @ApiProperty({ format: "date-time", example: "2026-08-17T09:12:00.000Z" })
  createdAt!: string;
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  pages!: number;
}

export class ListNotificationsResponseDto {
  @ApiProperty({ type: [NotificationDto] })
  notifications!: NotificationDto[];

  @ApiProperty({
    example: 3,
    description:
      "Unread count as of this same read — lets the header badge render from this response instead of a separate GET /notifications/unread-count call.",
  })
  unreadCount!: number;

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class UnreadCountResponseDto {
  @ApiProperty({ example: 3 })
  count!: number;
}

export class MarkAllNotificationsReadResponseDto {
  @ApiProperty({ example: 3 })
  updated!: number;
}
