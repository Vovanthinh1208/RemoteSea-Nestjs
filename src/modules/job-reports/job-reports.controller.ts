import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JobReportsService } from "./job-reports.service";
import {
  createJobReportSchema,
  type CreateJobReportDto,
} from "./dto/create-job-report.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiCreateJobReport,
  ApiJobReportsTag,
} from "./docs/job-reports.swagger";

@ApiJobReportsTag()
@Controller("jobs")
@UseGuards(JwtAuthGuard)
export class JobReportsController {
  constructor(
    private readonly jobReportsService: JobReportsService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  // No @Roles — any authenticated TALENT or EMPLOYER can flag a listing.
  @ApiCreateJobReport()
  @Post(":id/report")
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createJobReportSchema))
    body: CreateJobReportDto,
  ) {
    this.rateLimitService.enforce(
      `report-job:${user.id}`,
      RATE_LIMITS.REPORT_JOB.limit,
      RATE_LIMITS.REPORT_JOB.windowMs,
    );
    return this.jobReportsService.create(user, id, body);
  }
}
