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
  CreateProfileHighlightRequestDto,
  DeleteProfileHighlightResponseDto,
  ProfileHighlightResponseDto,
  UpdateProfileHighlightRequestDto,
} from "./profile-highlights.dto";
import {
  CreatePortfolioHighlightRequestExample,
  DeleteProfileHighlightResponseExample,
  PortfolioHighlightResponseExample,
  ProfileHighlightListResponseExample,
  UpdateProfileHighlightRequestExample,
  UpdateProfileHighlightResponseExample,
} from "./profile-highlights.examples";
import {
  ProfileHighlightLimitReachedResponse,
  ProfileHighlightNotFoundResponse,
  TalentProfileRequiredResponse,
  ValidationErrorResponse,
} from "./profile-highlights.responses";

export const ApiProfileHighlightsTag = () =>
  applyDecorators(ApiTags("Profile Highlights"));

export const ApiListProfileHighlights = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List my profile highlights",
      description:
        "Lists the current user's Selected work / Education / Language entries (all types together, oldest first — group by `type` client-side). Returns an empty array if the caller has no TalentProfile yet, rather than an error.",
    }),
    ApiOkResponse({
      description: "Profile highlight entries",
      type: ProfileHighlightResponseDto,
      isArray: true,
      schema: { example: ProfileHighlightListResponseExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiCreateProfileHighlight = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Add a profile highlight",
      description:
        "Creates a Selected work (`PORTFOLIO`), Education, or Language entry on the caller's talent profile — one model backs all three, which fields matter depends on `type` (see each field's description). Requires a TalentProfile to already exist (create one via `PUT /talent/me` first). Capped at 5 entries per `type` (not 5 total).",
    }),
    ApiBody({
      type: CreateProfileHighlightRequestDto,
      examples: { default: { value: CreatePortfolioHighlightRequestExample } },
    }),
    ApiCreatedResponse({
      description: "Entry created",
      type: ProfileHighlightResponseDto,
      schema: { example: PortfolioHighlightResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    TalentProfileRequiredResponse,
    ProfileHighlightLimitReachedResponse,
    InternalServerErrorApiResponse,
  );

export const ApiUpdateProfileHighlight = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Update a profile highlight",
      description:
        "Partial update — at least one field required. `type` is immutable and not part of this body. Ownership is enforced by ProfileHighlightOwnershipGuard — another user's entry 404s rather than 403s.",
    }),
    ApiParam({
      name: "id",
      description: "Profile highlight id (CUID)",
      example: "cme8f1a2b0000ug0h9x1n1a2",
    }),
    ApiBody({
      type: UpdateProfileHighlightRequestDto,
      examples: { default: { value: UpdateProfileHighlightRequestExample } },
    }),
    ApiOkResponse({
      description: "Entry updated",
      type: ProfileHighlightResponseDto,
      schema: { example: UpdateProfileHighlightResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ProfileHighlightNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiDeleteProfileHighlight = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Delete a profile highlight",
      description:
        "Deletes an entry owned by the current user's talent profile. Ownership is enforced by ProfileHighlightOwnershipGuard — another user's entry 404s rather than 403s.",
    }),
    ApiParam({
      name: "id",
      description: "Profile highlight id (CUID)",
      example: "cme8f1a2b0000ug0h9x1n1a2",
    }),
    ApiOkResponse({
      description: "Entry deleted",
      type: DeleteProfileHighlightResponseDto,
      schema: { example: DeleteProfileHighlightResponseExample },
    }),
    UnauthorizedApiResponse,
    ProfileHighlightNotFoundResponse,
    InternalServerErrorApiResponse,
  );
