import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Auth module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

export class RegisterRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: "Jane Doe" })
  name!: string;

  @ApiProperty({ format: "email", example: "jane.doe@example.com" })
  email!: string;

  @ApiProperty({ minLength: 8, example: "SuperSecret123" })
  password!: string;

  @ApiProperty({ enum: ["TALENT", "EMPLOYER"], example: "TALENT" })
  role!: "TALENT" | "EMPLOYER";
}

export class LoginRequestDto {
  @ApiProperty({ format: "email", example: "jane.doe@example.com" })
  email!: string;

  @ApiProperty({ minLength: 8, example: "SuperSecret123" })
  password!: string;
}

export class TokenResponseDto {
  @ApiProperty({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." })
  accessToken!: string;
}

export class SessionUserDto {
  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "jane.doe@example.com" })
  email!: string;

  @ApiProperty({ example: "Jane Doe" })
  name!: string;

  @ApiProperty({ enum: ["TALENT", "EMPLOYER", "ADMIN"], example: "TALENT" })
  role!: "TALENT" | "EMPLOYER" | "ADMIN";
}

export class SessionResponseDto {
  @ApiPropertyOptional({ type: SessionUserDto, nullable: true })
  user!: SessionUserDto | null;
}

// Shared by register/login/2FA-challenge success responses — bundles the
// access token with the session's user so the frontend never has to follow
// up with a separate GET /auth/session just to render post-auth.
export class AuthTokenResponseDto {
  @ApiProperty({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." })
  accessToken!: string;

  @ApiProperty({ type: SessionUserDto })
  user!: SessionUserDto;
}

export class ForgotPasswordRequestDto {
  @ApiProperty({ format: "email", example: "jane.doe@example.com" })
  email!: string;
}

export class ResetPasswordRequestDto {
  @ApiProperty({ minLength: 1, example: "9f3c2a1b8e7d6f5a4c3b2a1908f7e6d5" })
  token!: string;

  @ApiProperty({ minLength: 8, example: "NewSuperSecret456" })
  password!: string;
}

export class MessageResponseDto {
  @ApiProperty({ example: "If that email exists, a reset link was sent." })
  message!: string;
}

// ─── 2FA challenge issued instead of a token when 2FA is enabled ───────────

export class TwoFactorRequiredResponseDto {
  @ApiProperty({ example: true })
  twoFactorRequired!: true;

  @ApiProperty({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." })
  challengeToken!: string;
}

export class TwoFactorChallengeRequestDto {
  @ApiProperty({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." })
  challengeToken!: string;

  @ApiProperty({
    minLength: 6,
    maxLength: 32,
    description: "A 6-digit TOTP code, or a backup code (format XXXXX-XXXXX)",
    example: "123456",
  })
  code!: string;
}

export class TwoFactorStatusResponseDto {
  @ApiProperty({ example: false })
  enabled!: boolean;
}

export class TwoFactorSetupResponseDto {
  @ApiProperty({ example: "JBSWY3DPEHPK3PXP" })
  secret!: string;

  @ApiProperty({
    example:
      "otpauth://totp/RemoteSEA:jane.doe%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=RemoteSEA",
  })
  otpauthUrl!: string;

  @ApiProperty({ example: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." })
  qrCodeDataUrl!: string;
}

export class VerifyTwoFactorSetupRequestDto {
  @ApiProperty({ minLength: 6, maxLength: 6, example: "123456" })
  token!: string;
}

export class VerifyTwoFactorSetupResponseDto {
  @ApiProperty({
    type: [String],
    description:
      "Returned exactly once in plaintext — only bcrypt hashes are persisted.",
    example: ["A1B2C-D3E4F", "E9E55-7B3A1", "2F85F-E2047"],
  })
  backupCodes!: string[];
}

export class DisableTwoFactorRequestDto {
  @ApiProperty({ minLength: 1, example: "SuperSecret123" })
  password!: string;
}

export class TwoFactorMessageResponseDto {
  @ApiProperty({ example: "Two-factor authentication disabled" })
  message!: string;
}

// ─── Settings > Connected accounts "Connect" ───────────────────────────────

export class OAuthLinkUrlResponseDto {
  @ApiProperty({
    example:
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&state=...",
  })
  url!: string;
}
