import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Billing module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

export class CheckoutRequestDto {
  @ApiProperty({
    description: "CUID of a DRAFT, unpaid job owned by the current user",
    example: "cme8f1a2b0000ug0h9x1n1a2",
  })
  jobId!: string;
}

export class CheckoutResponseDto {
  @ApiPropertyOptional({
    nullable: true,
    example: "https://checkout.stripe.com/c/pay/cs_test_a1b2c3...",
  })
  url!: string | null;
}

export class WebhookResponseDto {
  @ApiProperty({ example: true })
  received!: boolean;
}
