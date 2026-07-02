import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { InternalServerErrorApiResponse, UnauthorizedApiResponse } from "@/core/swagger/common.responses";
import { SaveJobRequestDto, SavedJobResponseDto } from "./saved.dto";
import { NewlySavedExample, SaveJobRequestExample, SavedJobsListExample, UnSavedExample } from "./saved.examples";
import { ValidationErrorResponse } from "./saved.responses";

export const ApiSavedTag = () => applyDecorators(ApiTags("Saved Jobs"));

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

export const ApiToggleSaved = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Toggle save state for a job",
      description:
        "**Toggles** save state for a job — saves it if not already saved, un-saves (deletes) it if it is. Never returns a 409 'already saved' — it's a toggle. Response status is dynamic: `201 Created` (with `{ saved: true }`) when newly saved, `200 OK` (with `{ saved: false }`) when removed — same body shape either way.",
    }),
    ApiBody({ type: SaveJobRequestDto, examples: { default: { value: SaveJobRequestExample } } }),
    ApiResponse({ status: 201, description: "Job newly saved", schema: { example: NewlySavedExample } }),
    ApiResponse({ status: 200, description: "Job un-saved (was already saved)", schema: { example: UnSavedExample } }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse
  );
