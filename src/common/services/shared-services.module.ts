import { Global, Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { RateLimitService } from "./rate-limit.service";

@Global()
@Module({
  providers: [EmailService, RateLimitService],
  exports: [EmailService, RateLimitService],
})
export class SharedServicesModule {}
