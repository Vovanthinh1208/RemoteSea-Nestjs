import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { BillingService } from "./billing.service";
import { checkoutSchema, type CheckoutDto } from "./dto/checkout.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { ApiBillingTag, ApiCheckout, ApiWebhook } from "./docs/billing.swagger";

@ApiBillingTag()
@Controller("billing")
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly rateLimitService: RateLimitService
  ) {}

  @ApiCheckout()
  @Post("checkout")
  @UseGuards(JwtAuthGuard)
  async checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(checkoutSchema)) body: CheckoutDto
  ) {
    this.rateLimitService.enforce(`checkout:${user.id}`, RATE_LIMITS.CHECKOUT.limit, RATE_LIMITS.CHECKOUT.windowMs);
    return this.billingService.createCheckoutSession(user.id, body);
  }

  @ApiWebhook()
  @Post("webhook")
  async webhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers["stripe-signature"];
    if (!signature || Array.isArray(signature) || !req.rawBody) {
      throw new BadRequestApiException("Missing signature");
    }
    return this.billingService.handleWebhookEvent(req.rawBody, signature);
  }
}
