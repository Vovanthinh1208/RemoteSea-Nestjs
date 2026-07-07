import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { InternalServerErrorApiResponse, UnauthorizedApiResponse } from "@/core/swagger/common.responses";
import { SavedJobResponseDto } from "./saved.dto";
import { NewlySavedExample, SavedJobsListExample, UnSavedExample } from "./saved.examples";

export const ApiSavedTag = () => applyDecorators(ApiTags("Saved Jobs"));

const jobIdParam = () => ApiParam({ name: "jobId", description: "Job id", example: "cjob1a2b0000ug0h9x1n1a2" });

export const ApiListSaved = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List my saved jobs",
      description: "Returns the current user's saved jobs (most recent first) with embedded job listings.",
    }),
    ApiOkResponse({
      description: "The current user's saved jobs",
      type: SavedJobResponseDto,
      isArray: true,
      schema: { example: SavedJobsListExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse
  );

export const ApiSaveJob = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Save a job",
      description: "Idempotent — saves the job if not already saved; a repeat call is a no-op with the same response.",
    }),
    jobIdParam(),
    ApiOkResponse({ description: "Job is saved", schema: { example: NewlySavedExample } }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse
  );

export const ApiUnsaveJob = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Un-save a job",
      description: "Idempotent — removes the job from saved if present; a repeat call is a no-op with the same response.",
    }),
    jobIdParam(),
    ApiOkResponse({ description: "Job is no longer saved", schema: { example: UnSavedExample } }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse
  );
