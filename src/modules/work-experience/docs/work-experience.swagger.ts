import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
} from "@/core/swagger/common.responses";
import {
  CreateWorkExperienceRequestDto,
  DeleteWorkExperienceResponseDto,
  UpdateWorkExperienceRequestDto,
  WorkExperienceResponseDto,
} from "./work-experience.dto";
import {
  CreateWorkExperienceRequestExample,
  DeleteWorkExperienceResponseExample,
  UpdateWorkExperienceRequestExample,
  UpdateWorkExperienceResponseExample,
  WorkExperienceListResponseExample,
  WorkExperienceResponseExample,
} from "./work-experience.examples";
import {
  TalentProfileRequiredResponse,
  ValidationErrorResponse,
  WorkExperienceLimitReachedResponse,
  WorkExperienceNotFoundResponse,
} from "./work-experience.responses";

export const ApiWorkExperienceTag = () =>
  applyDecorators(ApiTags("Work Experience"));

export const ApiListWorkExperience = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List my work experience entries",
      description:
        "Lists the current user's talent-profile work-experience entries — current roles (endDate null) first, then most-recently-started first. Returns an empty array if the caller has no TalentProfile yet, rather than an error.",
    }),
    ApiOkResponse({
      description: "Work experience entries",
      type: WorkExperienceResponseDto,
      isArray: true,
      schema: { example: WorkExperienceListResponseExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiCreateWorkExperience = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Add a work experience entry",
      description:
        "Creates a new work-experience entry on the caller's talent profile. Requires a TalentProfile to already exist (create one via `PUT /talent/me` first). Capped at 5 entries per profile — matching the reference design's 'list up to 5 roles' copy.",
    }),
    ApiBody({
      type: CreateWorkExperienceRequestDto,
      examples: { default: { value: CreateWorkExperienceRequestExample } },
    }),
    ApiCreatedResponse({
      description: "Entry created",
      type: WorkExperienceResponseDto,
      schema: { example: WorkExperienceResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    TalentProfileRequiredResponse,
    WorkExperienceLimitReachedResponse,
    InternalServerErrorApiResponse,
  );

export const ApiUpdateWorkExperience = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Update a work experience entry",
      description:
        "Partial update — at least one field required. Set `endDate` to `null` to clear it back to a current role. Ownership is enforced by WorkExperienceOwnershipGuard — another user's entry 404s rather than 403s.",
    }),
    ApiParam({
      name: "id",
      description: "Work experience entry id (CUID)",
      example: "cme8f1a2b0000ug0h9x1n1a2",
    }),
    ApiBody({
      type: UpdateWorkExperienceRequestDto,
      examples: { default: { value: UpdateWorkExperienceRequestExample } },
    }),
    ApiOkResponse({
      description: "Entry updated",
      type: WorkExperienceResponseDto,
      schema: { example: UpdateWorkExperienceResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    WorkExperienceNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiDeleteWorkExperience = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Delete a work experience entry",
      description:
        "Deletes an entry owned by the current user's talent profile. Ownership is enforced by WorkExperienceOwnershipGuard — another user's entry 404s rather than 403s.",
    }),
    ApiParam({
      name: "id",
      description: "Work experience entry id (CUID)",
      example: "cme8f1a2b0000ug0h9x1n1a2",
    }),
    ApiOkResponse({
      description: "Entry deleted",
      type: DeleteWorkExperienceResponseDto,
      schema: { example: DeleteWorkExperienceResponseExample },
    }),
    UnauthorizedApiResponse,
    WorkExperienceNotFoundResponse,
    InternalServerErrorApiResponse,
  );
