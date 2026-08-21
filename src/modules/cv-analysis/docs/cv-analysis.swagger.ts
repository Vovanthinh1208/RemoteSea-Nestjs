import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
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
import { CvAnalysisResponseDto } from "./cv-analysis.dto";
import {
  ApplicationAccessDeniedResponse,
  ApplicationNotFoundResponse,
  CvAnalysisUnavailableResponse,
  NoResumeResponse,
} from "./cv-analysis.responses";

export const ApiGetCvAnalysis = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary:
        "Get (or lazily generate) an AI fit analysis of this applicant's CV",
      description:
        "Cached 1:1 per application — the first call for a given application parses the resume and calls the LLM (a few seconds); every call after returns the cached row instantly. Never shown to the talent. Open to any team member with access to this application, same eligibility as scorecards.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiOkResponse({
      description: "The (possibly freshly generated) analysis",
      type: CvAnalysisResponseDto,
    }),
    NoResumeResponse,
    CvAnalysisUnavailableResponse,
    ApplicationNotFoundResponse,
    ApplicationAccessDeniedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    rateLimitResponse("20 req/60s per user"),
    InternalServerErrorApiResponse,
  );
