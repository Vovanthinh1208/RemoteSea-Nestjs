import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
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
  PublicTalentProfileResponseDto,
  TalentProfileRequestDto,
  TalentProfileResponseDto,
} from "./talent.dto";
import {
  OwnTalentProfileExample,
  PublicTalentProfileClosedExample,
  PublicTalentProfileOpenExample,
  TalentProfileRequestExample,
  UpsertTalentProfileExample,
} from "./talent.examples";
import {
  ProfileNotFoundResponse,
  ValidationErrorResponse,
} from "./talent.responses";

export const ApiTalentTag = () => applyDecorators(ApiTags("Talent"));

export const ApiGetOwnProfile = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Get own talent profile",
      description:
        "Returns the authenticated user's own talent profile with skills and their name.",
    }),
    ApiOkResponse({
      description: "The caller's talent profile",
      type: TalentProfileResponseDto,
      schema: { example: OwnTalentProfileExample },
    }),
    UnauthorizedApiResponse,
    ProfileNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiUpsertProfile = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Create or update own talent profile",
      description:
        "Upserts the authenticated user's talent profile; if `skills` is provided, fully replaces the skill list (transactional delete-then-insert). `slug` is only set on first creation — later PUTs never change it. `level` defaults to `MID` and `currency` always defaults to `USD` on first creation; `currency` cannot be set via this endpoint. `visibility` (Settings > Privacy & data) defaults to `PUBLIC` and is enforced on `GET /talent/:slug`.",
    }),
    ApiBody({
      type: TalentProfileRequestDto,
      examples: { default: { value: TalentProfileRequestExample } },
    }),
    ApiOkResponse({
      description:
        "Profile created/updated — same shape as `GET /talent/me` but without the `user` field",
      type: TalentProfileResponseDto,
      schema: { example: UpsertTalentProfileExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiGetPublicProfile = () =>
  applyDecorators(
    ApiOperation({
      summary: "Get public talent profile by slug",
      description:
        "Public lookup of a talent profile by slug — no auth required, but an `Authorization: Bearer <jwt>` header is read if present (the only route in the app that's unauthenticated yet optionally auth-aware). Gated by the profile's `visibility`: a `PUBLIC` profile (the default) is visible to anyone; a `VERIFIED_EMPLOYERS` profile only to a caller authenticated as a verified EmployerProfile — anyone else gets the same 404 as a nonexistent slug, so a gated profile's existence isn't revealed. `desiredSalaryMin`/`desiredSalaryMax` are also omitted entirely from the response (key absent, not null) unless `isOpenToWork` is true.",
    }),
    ApiParam({ name: "slug", type: String, example: "jane-doe-a1b2c3" }),
    ApiOkResponse({
      description:
        "Public talent profile; compensation fields present only when open to work",
      type: PublicTalentProfileResponseDto,
      schema: {
        examples: {
          openToWork: { value: PublicTalentProfileOpenExample },
          notOpenToWork: { value: PublicTalentProfileClosedExample },
        },
      },
    }),
    ProfileNotFoundResponse,
    InternalServerErrorApiResponse,
  );
