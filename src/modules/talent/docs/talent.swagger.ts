import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  ForbiddenApiResponse,
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
} from "@/core/swagger/common.responses";
import {
  PublicTalentProfileResponseDto,
  TalentProfileRequestDto,
  TalentProfileResponseDto,
  TalentSearchResponseDto,
} from "./talent.dto";
import {
  OwnTalentProfileExample,
  PublicTalentProfileClosedExample,
  PublicTalentProfileOpenExample,
  TalentProfileRequestExample,
  TalentSearchExample,
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
        "Returns the authenticated user's own talent profile with skills, work experience, profile highlights (Selected work / Education / Language entries), and their name.",
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
        "Upserts the authenticated user's talent profile; if `skills` is provided, fully replaces the skill list (transactional delete-then-insert). `slug` is only set on first creation — later PUTs never change it. `level` defaults to `MID` and `currency` always defaults to `USD` on first creation; `currency` cannot be set via this endpoint. `visibility` (Settings > Privacy & data) defaults to `PUBLIC` and is enforced on `GET /talent/:slug`. `employmentTypes`/`timezoneOverlap` each replace their entire set on every call — send the full desired list, not just the changed entry. Work experience and profile highlights (Selected work / Education / Languages) are separate resources — see `POST /talent/me/experience` and `POST /talent/me/highlights`.",
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

export const ApiSearchTalent = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Search the talent pool (employer only)",
      description:
        "Lets an authenticated EMPLOYER browse candidates instead of only receiving applicants. Only returns profiles with `isOpenToWork: true` — someone who hasn't opted into being found never appears here, regardless of filters. `visibility: VERIFIED_EMPLOYERS` profiles are additionally included only when the caller's own EmployerProfile has `isVerified: true` (same rule `GET /talent/:slug` enforces). No relevance/match ranking — filters are exact-match/contains only; a personalized match score against one of the employer's own jobs is computed client-side, the same way it already is for GET /jobs and the applicants list.",
    }),
    ApiQuery({ name: "q", required: false, example: "backend engineer" }),
    ApiQuery({
      name: "skills",
      required: false,
      isArray: true,
      example: ["clx4skill0001node"],
    }),
    ApiQuery({
      name: "level",
      required: false,
      isArray: true,
      example: ["SENIOR", "LEAD"],
    }),
    ApiQuery({
      name: "country",
      required: false,
      isArray: true,
      example: ["Vietnam"],
    }),
    ApiQuery({
      name: "employmentTypes",
      required: false,
      isArray: true,
      example: ["FULL_TIME"],
    }),
    ApiQuery({
      name: "timezoneOverlap",
      required: false,
      isArray: true,
      example: ["SG_HOURS"],
    }),
    ApiQuery({
      name: "noticePeriod",
      required: false,
      isArray: true,
      example: ["Immediate", "2 weeks"],
    }),
    ApiQuery({ name: "page", required: false, example: 1 }),
    ApiQuery({ name: "limit", required: false, example: 20 }),
    ApiOkResponse({
      description: "Paginated candidates matching the filters",
      type: TalentSearchResponseDto,
      schema: { example: TalentSearchExample },
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiGetPublicProfile = () =>
  applyDecorators(
    ApiOperation({
      summary: "Get public talent profile by slug",
      description:
        "Public lookup of a talent profile by slug — no auth required, but an `Authorization: Bearer <jwt>` header is read if present (the only route in the app that's unauthenticated yet optionally auth-aware). Gated by the profile's `visibility`: a `PUBLIC` profile (the default) is visible to anyone; a `VERIFIED_EMPLOYERS` profile only to a caller authenticated as a verified EmployerProfile — anyone else gets the same 404 as a nonexistent slug, so a gated profile's existence isn't revealed. `desiredSalaryMin`/`desiredSalaryMax` are also omitted entirely from the response (key absent, not null) unless `isOpenToWork` is true. `primaryRole`/`rightToWork`/`employmentTypes`/`timezoneOverlap`/`noticePeriod`, `workExperiences` (current role first, then most-recently-started), and `profileHighlights` (Selected work / Education / Languages) ARE included — unlike `visibility` itself, none of these are gated.",
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
