import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
} from "@nestjs/swagger";

export const ApplicationNotFoundResponse = ApiNotFoundResponse({
  description: "No application with that id",
  schema: { example: { error: "Not found" } },
});

export const ApplicationAccessDeniedResponse = ApiForbiddenResponse({
  description:
    "The caller isn't a company member with access to this application",
  schema: { example: { error: "Forbidden" } },
});

export const NoResumeResponse = ApiBadRequestResponse({
  description: "The applicant hasn't uploaded a CV",
  schema: { example: { error: "This applicant hasn't uploaded a CV." } },
});

export const CvAnalysisUnavailableResponse = ApiServiceUnavailableResponse({
  description:
    "ANTHROPIC_API_KEY isn't configured, or the LLM call/CV fetch failed",
  schema: {
    example: { error: "CV analysis is not configured." },
  },
});
