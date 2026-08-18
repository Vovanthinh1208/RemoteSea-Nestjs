import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";
import {
  CreateJobReportRequestDto,
  CreateJobReportResponseDto,
} from "./job-reports.dto";
import {
  CreateJobReportRequestExample,
  CreateJobReportResponseExample,
} from "./job-reports.examples";
import {
  JobAlreadyReportedResponse,
  ReportJobNotFoundResponse,
  ValidationErrorResponse,
} from "./job-reports.responses";

export const ApiJobReportsTag = () => applyDecorators(ApiTags("Job Reports"));

export const ApiCreateJobReport = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Report a job listing",
      description:
        "Flags a job as suspicious/scam/misleading for admin review. Any authenticated role may call this — no @Roles restriction. Does not change the job's own status; it's a signal reviewed separately in the admin console. Blocked with 409 if the caller already has an OPEN report on this job (a prior report that was resolved or dismissed doesn't block a new one).",
    }),
    ApiParam({ name: "id", description: "Job id" }),
    ApiBody({
      type: CreateJobReportRequestDto,
      examples: { default: { value: CreateJobReportRequestExample } },
    }),
    ApiCreatedResponse({
      description: "Report created",
      type: CreateJobReportResponseDto,
      schema: { example: CreateJobReportResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ReportJobNotFoundResponse,
    JobAlreadyReportedResponse,
    rateLimitResponse("10/hour"),
    InternalServerErrorApiResponse,
  );
