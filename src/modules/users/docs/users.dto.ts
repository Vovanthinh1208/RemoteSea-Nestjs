import { ApiProperty } from "@nestjs/swagger";

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
