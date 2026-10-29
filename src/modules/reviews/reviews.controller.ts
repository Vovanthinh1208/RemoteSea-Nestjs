import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ReviewsService } from "./reviews.service";
import {
  createReviewSchema,
  type CreateReviewDto,
} from "./dto/create-review.dto";
import {
  listUserReviewsSchema,
  type ListUserReviewsDto,
} from "./dto/list-user-reviews.dto";
import {
  reviewEligibilityQuerySchema,
  type ReviewEligibilityQueryDto,
} from "./dto/review-eligibility.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiCreateReview,
  ApiGetEligibility,
  ApiGetPartnerEligibility,
  ApiListUserReviews,
  ApiReviewsTag,
} from "./docs/reviews.swagger";

@ApiReviewsTag()
@Controller("reviews")
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  // Single endpoint usable by either party (unlike messages/interviews,
  // which split talent/employer routes at the controller level) — direction
  // is derived server-side from which party the caller is, never taken from
  // the request, so one implementation covers both directions instead of
  // two mirrored ones.
  // PB70 AC2: GET /reviews/eligibility?partnerId=… — the backlog's contract.
  // The per-application route below stays for callers that already know the
  // application.
  @ApiGetPartnerEligibility()
  @Get("eligibility")
  @UseGuards(JwtAuthGuard)
  getPartnerEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reviewEligibilityQuerySchema))
    query: ReviewEligibilityQueryDto,
  ) {
    return this.reviewsService.getEligibilityForPartner(user.id, query);
  }

  @ApiGetEligibility()
  @Get("eligibility/:applicationId")
  @UseGuards(JwtAuthGuard)
  getEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId") applicationId: string,
  ) {
    return this.reviewsService.getEligibility(user.id, applicationId);
  }

  @ApiCreateReview()
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createReviewSchema)) body: CreateReviewDto,
  ) {
    this.rateLimitService.enforce(
      `review-create:${user.id}`,
      RATE_LIMITS.CREATE_REVIEW.limit,
      RATE_LIMITS.CREATE_REVIEW.windowMs,
    );
    return this.reviewsService.create(user.id, body);
  }

  // Unauthenticated by design — a published review is public profile
  // content, same visibility as the talent/company profile it's attached
  // to (GET /talent/:slug, GET /companies/:slug).
  @ApiListUserReviews()
  @Get("user/:userId")
  listForUser(
    @Param("userId") userId: string,
    @Query(new ZodValidationPipe(listUserReviewsSchema))
    query: ListUserReviewsDto,
  ) {
    return this.reviewsService.listForUser(userId, query);
  }
}
