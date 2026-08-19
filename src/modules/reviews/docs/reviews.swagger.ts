import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";
import {
  CreateReviewRequestDto,
  ListUserReviewsResponseDto,
  ReviewEligibilityResponseDto,
  ReviewResponseDto,
} from "./reviews.dto";
import {
  CreateReviewRequestExample,
  ListUserReviewsResponseExample,
  ReviewEligibilityEligibleExample,
  ReviewResponseExample,
} from "./reviews.examples";
import {
  ApplicationNotFoundResponse,
  ReviewAlreadyExistsResponse,
  ReviewNotEligibleResponse,
  ValidationErrorResponse,
} from "./reviews.responses";

export const ApiReviewsTag = () => applyDecorators(ApiTags("Reviews"));

export const ApiGetEligibility = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Check review eligibility for an application",
      description:
        "Eligible once the application's Interview has been CONFIRMED — the strongest verified interaction the schema has today (see the Review model's schema comment). Caller must be the talent or the employer on this application; a non-party gets the same 404 as a nonexistent id. `direction` and `revieweeId` are derived server-side from which party the caller is, never taken from the request.",
    }),
    ApiParam({ name: "applicationId" }),
    ApiOkResponse({
      description: "Eligibility for the caller on this application",
      type: ReviewEligibilityResponseDto,
      schema: { example: ReviewEligibilityEligibleExample },
    }),
    UnauthorizedApiResponse,
    ApplicationNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiCreateReview = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Submit a review for a verified interaction",
      description:
        "Creates a review of the other party on `applicationId`. The server derives `direction` and the reviewee from the application — a request cannot target an arbitrary user. Rejects: caller not a party to the application (404), interview not CONFIRMED (403), a category rating that doesn't belong to the resolved direction (400), and a duplicate review of the same application by the same caller (409, also enforced by a unique constraint under a race).",
    }),
    ApiBody({
      type: CreateReviewRequestDto,
      examples: { default: { value: CreateReviewRequestExample } },
    }),
    ApiCreatedResponse({
      description: "Review created",
      type: ReviewResponseDto,
      schema: { example: ReviewResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ApplicationNotFoundResponse,
    ReviewNotEligibleResponse,
    ReviewAlreadyExistsResponse,
    rateLimitResponse("10 req/60s per user"),
    InternalServerErrorApiResponse,
  );

export const ApiListUserReviews = () =>
  applyDecorators(
    ApiOperation({
      summary: "List reviews received by a user, with rating aggregates",
      description:
        "Public — a published review is profile content, same visibility as the talent/company profile page it appears on. Averages are computed in the database (aggregate), not by loading every row. `userId` is the reviewee's User id (the same `userId` field GET /talent/:slug and GET /companies/:slug already return).",
    }),
    ApiParam({ name: "userId" }),
    ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
    ApiQuery({ name: "limit", required: false, type: Number, example: 20 }),
    ApiOkResponse({
      description: "Rating aggregate + paginated review list",
      type: ListUserReviewsResponseDto,
      schema: { example: ListUserReviewsResponseExample },
    }),
    ValidationErrorResponse,
    InternalServerErrorApiResponse,
  );
