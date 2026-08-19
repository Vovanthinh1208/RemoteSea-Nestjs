import { Global, Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { RateLimitService } from "./rate-limit.service";
import { AuditLogService } from "./audit-log.service";

@Global()
@Module({
  providers: [EmailService, RateLimitService, AuditLogService],
  exports: [EmailService, RateLimitService, AuditLogService],
})
export class SharedServicesModule {}
