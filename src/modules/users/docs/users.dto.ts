import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Users module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

export class UpdateUserRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: "Jane A. Doe" })
  name!: string;
}

export class UpdateUserResponseDto {
  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "Jane A. Doe" })
  name!: string;

  @ApiProperty({ example: "jane.doe@example.com" })
  email!: string;
}

export class DeleteAccountResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}

export class ChangePasswordRequestDto {
  @ApiProperty({ minLength: 1, example: "SuperSecret123" })
  currentPassword!: string;

  @ApiProperty({ minLength: 8, example: "NewSuperSecret456" })
  newPassword!: string;
}

export class MessageResponseDto {
  @ApiProperty({ example: "Password updated" })
  message!: string;
}

// ─── Settings > Account ────────────────────────────────────────────────────

export class AccountFieldsResponseDto {
  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ nullable: true, example: "+84 90 123 4567" })
  phone!: string | null;

  @ApiProperty({ enum: ["English", "Tiếng Việt"], example: "English" })
  language!: string;

  @ApiProperty({
    enum: ["Vietnam", "Singapore", "Australia"],
    example: "Vietnam",
  })
  region!: string;

  @ApiProperty({ enum: ["USD ($)", "VND (₫)", "SGD (S$)"], example: "USD ($)" })
  currencyDisplay!: string;

  @ApiPropertyOptional({
    nullable: true,
    format: "uri",
    example: "https://cdn.remotesea.io/uploads/avatar/cme8f1.../photo.jpg",
    description: "Profile setup avatar. null if never uploaded.",
  })
  image!: string | null;
}

export class UpdateAccountRequestDto {
  @ApiPropertyOptional({ example: "+84 90 123 4567" })
  phone?: string;

  @ApiPropertyOptional({ enum: ["English", "Tiếng Việt"] })
  language?: string;

  @ApiPropertyOptional({ enum: ["Vietnam", "Singapore", "Australia"] })
  region?: string;

  @ApiPropertyOptional({ enum: ["USD ($)", "VND (₫)", "SGD (S$)"] })
  currencyDisplay?: string;

  @ApiPropertyOptional({
    nullable: true,
    format: "uri",
    example: "https://cdn.remotesea.io/uploads/avatar/cme8f1.../photo.jpg",
    description:
      "Must be a URL from this account's own POST /uploads/presign (type: avatar) response — any other URL is rejected. Pass null to remove the photo.",
  })
  image?: string | null;
}

// ─── Settings > Notifications ──────────────────────────────────────────────

export class NotificationPreferencesResponseDto {
  @ApiProperty({ example: "clx4notifpref0001" })
  id!: string;

  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a2" })
  userId!: string;

  @ApiProperty({ example: true })
  applicationUpdates!: boolean;

  @ApiProperty({ example: true })
  employerMessages!: boolean;

  @ApiProperty({ example: true })
  weeklyDigest!: boolean;

  @ApiProperty({ example: true })
  instantMatchAlerts!: boolean;

  @ApiProperty({ example: false })
  productNews!: boolean;

  @ApiProperty({ example: true })
  tipsAndResources!: boolean;

  @ApiProperty({ example: true })
  browserPush!: boolean;

  @ApiProperty({ example: "2026-07-28T10:00:00.000Z" })
  updatedAt!: string;
}

export class UpdateNotificationPreferencesRequestDto {
  @ApiPropertyOptional() applicationUpdates?: boolean;
  @ApiPropertyOptional() employerMessages?: boolean;
  @ApiPropertyOptional() weeklyDigest?: boolean;
  @ApiPropertyOptional() instantMatchAlerts?: boolean;
  @ApiPropertyOptional() productNews?: boolean;
  @ApiPropertyOptional() tipsAndResources?: boolean;
  @ApiPropertyOptional() browserPush?: boolean;
}

// ─── Settings > Danger zone "Pause my account" ─────────────────────────────

export class PauseStateResponseDto {
  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: false })
  isPaused!: boolean;

  @ApiProperty({ nullable: true, example: null })
  pausedAt!: string | null;
}

// ─── Settings > Privacy & data "Download your data" ────────────────────────

export class ExportDataResponseDto {
  @ApiProperty({ example: "2026-07-28T10:00:00.000Z" })
  exportedAt!: string;

  @ApiProperty({
    description:
      "The account row plus its talent profile (with skills/applications) or employer profile (with jobs), and job alerts. Internal-only fields (passwordHash, stripeSessionId, reviewNote, etc.) are excluded.",
    example: {
      id: "cme8f1a2b0000ug0h9x1n1a2",
      email: "jane.doe@example.com",
      name: "Jane Doe",
      phone: null,
      role: "TALENT",
      createdAt: "2026-01-15T09:12:00.000Z",
      talent: {
        headline: "Senior Backend Engineer",
        skills: [],
        applications: [],
      },
      employer: null,
      jobAlerts: [],
    },
  })
  account!: Record<string, unknown>;
}

// ─── Settings > Connected accounts ─────────────────────────────────────────

export class ConnectionResponseDto {
  @ApiProperty({ enum: ["google", "github", "linkedin"], example: "google" })
  provider!: string;

  @ApiProperty({ example: "104852384756293847561" })
  providerAccountId!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  createdAt!: string | null;
}

export class SuccessResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}

// ─── Settings > Security > Active sessions ─────────────────────────────────

export class SessionResponseDto {
  @ApiProperty({ example: "cms4iborq0003exhoppxthw5w" })
  id!: string;

  @ApiProperty({ example: "Chrome on macOS" })
  device!: string;

  @ApiProperty({ nullable: true, example: "203.0.113.4" })
  ip!: string | null;

  @ApiProperty({ nullable: true, example: "Ho Chi Minh City, Vietnam" })
  location!: string | null;

  @ApiProperty({ example: "2026-07-28T10:22:38.631Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-07-28T10:22:38.631Z" })
  lastSeenAt!: string;

  @ApiProperty({ example: true })
  current!: boolean;
}

export class RevokeOtherSessionsResponseDto {
  @ApiProperty({ example: 2 })
  revokedCount!: number;
}
