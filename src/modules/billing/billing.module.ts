import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { BillingRepository } from "./billing.repository";
import { STRIPE_CLIENT } from "./constants";
import type { EnvConfig } from "@/core/config/env.validation";

@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingRepository,
    {
      provide: STRIPE_CLIENT,
      useFactory: (config: ConfigService<EnvConfig, true>) =>
        // Stripe's constructor throws synchronously on an empty key, which would
        // crash the whole process at boot (unlike the original per-route Next.js
        // handler, which only failed when that specific route was hit). Fall back
        // to a placeholder so the app boots; billing calls fail at request time
        // instead, matching env.ts treating STRIPE_SECRET_KEY as optional.
        new Stripe(config.get("STRIPE_SECRET_KEY", { infer: true }) || "sk_test_unconfigured", {
          apiVersion: "2026-05-27.dahlia" as Stripe.LatestApiVersion,
        }),
      inject: [ConfigService],
    },
  ],
})
export class BillingModule {}
