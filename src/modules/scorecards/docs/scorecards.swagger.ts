import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from "@nestjs/swagger";
import {
  ForbiddenApiResponse,
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";
import {
  CreateScorecardRequestDto,
  ScorecardListResponseDto,
  ScorecardResponseDto,
} from "./scorecards.dto";
import {
  CreateScorecardRequestExample,
  ScorecardExample,
  ScorecardListExample,
} from "./scorecards.examples";
import {
  ApplicationAccessDeniedResponse,
  ApplicationNotFoundResponse,
  ScorecardAlreadyExistsResponse,
  ScorecardNotEligibleResponse,
  ValidationErrorResponse,
} from "./scorecards.responses";

export const ApiListScorecards = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List internal hiring feedback for an application",
      description:
        "Private to the company — never shown to the talent. Open to any team member with access to this application (APPLICATION_REVIEW_ROLES, or the specific INTERVIEWER assigned to it), not just whoever ran the interview. `summary.hireCount` counts STRONGLY_RECOMMEND/RECOMMEND; `summary.averages` holds the per-criterion (1–5) and overall means; `summary.recommendations` counts each recommendation.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiOkResponse({
      description: "Every scorecard submitted for this application so far",
      type: ScorecardListResponseDto,
      schema: { example: ScorecardListExample },
    }),
    ApplicationNotFoundResponse,
    ApplicationAccessDeniedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiCreateScorecard = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Submit internal hiring feedback (company team members only)",
      description:
        "Requires the application's interview to be CONFIRMED and its confirmedSlot to have already passed. One scorecard per author per application — not editable afterward; resubmitting returns 409.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiBody({
      type: CreateScorecardRequestDto,
      examples: { default: { value: CreateScorecardRequestExample } },
    }),
    ApiCreatedResponse({
      description: "Scorecard submitted",
      type: ScorecardResponseDto,
      schema: { example: ScorecardExample },
    }),
    ValidationErrorResponse,
    ScorecardNotEligibleResponse,
    ScorecardAlreadyExistsResponse,
    ApplicationNotFoundResponse,
    ApplicationAccessDeniedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    rateLimitResponse("10 req/60s per user"),
    InternalServerErrorApiResponse,
  );
