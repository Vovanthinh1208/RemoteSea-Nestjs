import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { InternalServerErrorApiResponse, UnauthorizedApiResponse } from "@/core/swagger/common.responses";
import { ApplicationResponseDto, ApplicationWithJobResponseDto, ApplyRequestDto } from "./applications.dto";
import { ApplicationsListExample, ApplyRequestExample, ApplyResponseExample } from "./applications.examples";
import { AlreadyAppliedResponse, TalentProfileRequiredResponse, ValidationErrorResponse, applyRateLimitResponse } from "./applications.responses";

export const ApiApplicationsTag = () => applyDecorators(ApiTags("Applications"));

export const ApiListApplications = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List my applications",
      description:
        "Returns the current user's applications (most recent first), each with the embedded job listing. Returns `[]` if the user has no TalentProfile (rather than an error).",
    }),
    ApiOkResponse({
      description: "The current user's applications",
      type: ApplicationWithJobResponseDto,
      isArray: true,
      schema: { example: ApplicationsListExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse
  );

export const ApiApply = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Apply to a job",
      description:
        "Submits a job application as the current user's talent profile; increments the job's applyCount; emails the employer. Requires an existing TalentProfile.",
    }),
    ApiBody({ type: ApplyRequestDto, examples: { default: { value: ApplyRequestExample } } }),
    ApiCreatedResponse({ description: "Application created", type: ApplicationResponseDto, schema: { example: ApplyResponseExample } }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    TalentProfileRequiredResponse,
    AlreadyAppliedResponse,
    applyRateLimitResponse("10 req/60s per user"),
    InternalServerErrorApiResponse
  );
