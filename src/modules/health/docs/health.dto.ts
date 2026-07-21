import { ApiProperty } from "@nestjs/swagger";

/**
 * Swagger-only response shapes for the Health module.
 *
 * HealthController writes its response directly via @Res() and never
 * throws, so it does NOT follow the app's usual `{ error }` convention
 * (see GlobalExceptionFilter) — these classes exist purely so Swagger can
 * render the two literal shapes it actually returns.
 */

export class HealthOkResponseDto {
  @ApiProperty({ enum: ["ok"], example: "ok" })
  status!: "ok";

  @ApiProperty({ example: "2026-07-02T10:00:00.000Z" })
  timestamp!: string;

  @ApiProperty({ enum: ["connected"], example: "connected" })
  db!: "connected";
}

export class HealthErrorResponseDto {
  @ApiProperty({ enum: ["error"], example: "error" })
  status!: "error";

  @ApiProperty({ enum: ["disconnected"], example: "disconnected" })
  db!: "disconnected";
}

export class HealthLiveResponseDto {
  @ApiProperty({ enum: ["ok"], example: "ok" })
  status!: "ok";
}
