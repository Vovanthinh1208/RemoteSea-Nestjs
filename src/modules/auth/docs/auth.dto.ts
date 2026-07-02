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

export class RegisterResponseDto {
  @ApiProperty({ example: "cme8f1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "jane.doe@example.com" })
  email!: string;

  @ApiProperty({ example: "Jane Doe" })
  name!: string;

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
