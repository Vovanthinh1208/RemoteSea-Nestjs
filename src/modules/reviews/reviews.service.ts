import { Injectable } from "@nestjs/common";
import { Prisma, type ReviewDirection } from "@prisma/client";
import { ReviewsRepository } from "./reviews.repository";
import type { CreateReviewDto } from "./dto/create-review.dto";
import type { ListUserReviewsDto } from "./dto/list-user-reviews.dto";
import type { ReviewApplicationContext } from "./interfaces";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import { isInterviewComplete } from "@/modules/interviews/interview-eligibility.util";
import { containsBlockedTerm } from "./content-policy.util";
import type { ReviewEligibilityQueryDto } from "./dto/review-eligibility.dto";

// PB70 AC3.2: why a review isn't (or is no longer) possible.
export type ReviewIneligibleReason =
  | "NO_INTERVIEW"
  | "INTERVIEW_NOT_CONFIRMED"
  | "INTERVIEW_NOT_YET_HELD"
  | "ALREADY_REVIEWED";

export type ReviewEligibility = {
  eligible: boolean;
  reason: ReviewIneligibleReason | null;
  direction: ReviewDirection | null;
  revieweeId: string | null;
  alreadyReviewed: boolean;
};

export type PartnerReviewEligibility = ReviewEligibility & {
  // The application a review would be written against (the most recent
  // eligible one), or null when none qualifies.
  applicationId: string | null;
};

const interviewIneligibleReason = (
  interview: { status: string; confirmedSlot: Date | null } | null,
): ReviewIneligibleReason => {
  if (!interview || interview.status === "CANCELLED") return "NO_INTERVIEW";
  if (interview.status !== "CONFIRMED" || !interview.confirmedSlot) {
    return "INTERVIEW_NOT_CONFIRMED";
  }
  return "INTERVIEW_NOT_YET_HELD";
};

type Party = { application: ReviewApplicationContext; isTalent: boolean };

@Injectable()
export class ReviewsService {
  constructor(private readonly reviewsRepository: ReviewsRepository) {}

  // Confirms the caller is actually one of the two people involved in this
  // application before anything else runs — the single choke point every
  // eligibility/creation decision below is built on. A caller who isn't a
  // party gets exactly the same response as a nonexistent id (null), never
  // a distinguishable 403 — same "don't confirm another party's application
  // exists" reasoning used throughout this codebase (e.g.
  // EmployerService's NOT_FOUND-not-403 handling on a mismatched owner).
  private async resolveParty(
    userId: string,
    applicationId: string,
  ): Promise<Party | null> {
    const application =
      await this.reviewsRepository.findApplicationForReview(applicationId);
    if (!application) return null;

    const isTalent = application.talent.userId === userId;
    const isEmployer = application.job.employer.userId === userId;
    if (!isTalent && !isEmployer) return null;

    return { application, isTalent };
  }

  // The eligibility rule itself (CONFIRMED + slot passed) lives in
  // isInterviewComplete, shared with ScorecardsService via
  // InterviewsService.isComplete — this module fetches the interview
  // bundled into reviewApplicationSelect instead of going through that
  // service, so the application/talent/employer/interview shape needed for
  // resolveParty and eligibility comes back in one query, not two. See the
  // Review Prisma model's own comment for why "CONFIRMED and passed" — not
  // Application.status — is the strongest verified two-sided interaction
  // available without inventing a new interaction system.
  private isEligibleInteraction(application: ReviewApplicationContext) {
    return isInterviewComplete(application.interview);
  }

  private directionFor(isTalent: boolean): ReviewDirection {
    return isTalent ? "TALENT_TO_EMPLOYER" : "EMPLOYER_TO_TALENT";
  }

  private revieweeIdFor(
    application: ReviewApplicationContext,
    isTalent: boolean,
  ): string {
    return isTalent
      ? application.job.employer.userId
      : application.talent.userId;
  }

  async getEligibility(
    userId: string,
    applicationId: string,
  ): Promise<ReviewEligibility> {
    const party = await this.resolveParty(userId, applicationId);
    if (!party) {
      throw new NotFoundApiException(
        "Application not found",
        ErrorCode.APPLICATION_NOT_FOUND,
      );
    }
    const { application, isTalent } = party;

    if (!this.isEligibleInteraction(application)) {
      return {
        eligible: false,
        reason: interviewIneligibleReason(application.interview),
        direction: null,
        revieweeId: null,
        alreadyReviewed: false,
      };
    }

    const direction = this.directionFor(isTalent);
    const revieweeId = this.revieweeIdFor(application, isTalent);
    const existing = await this.reviewsRepository.findByReviewerAndApplication(
      userId,
      applicationId,
    );

    return {
      eligible: !existing,
      reason: existing ? "ALREADY_REVIEWED" : null,
      direction,
      revieweeId,
      alreadyReviewed: !!existing,
    };
  }

  // PB70 AC2–3: eligibility by partner (the other party's user id) rather
  // than by a known application — eligible when at least one interview
  // between the two was CONFIRMED and has already taken place, and the
  // caller hasn't reviewed that interaction yet.
  async getEligibilityForPartner(
    userId: string,
    query: ReviewEligibilityQueryDto,
  ): Promise<PartnerReviewEligibility> {
    const applications =
      query.partnerId === userId
        ? []
        : await this.reviewsRepository.findApplicationsBetween(
            userId,
            query.partnerId,
          );
    const completed = applications.filter((a) =>
      isInterviewComplete(a.interview),
    );

    if (completed.length === 0) {
      // Report the most advanced state reached across all applications.
      const reasons = applications.map((a) =>
        interviewIneligibleReason(a.interview),
      );
      const reason: ReviewIneligibleReason = reasons.includes(
        "INTERVIEW_NOT_YET_HELD",
      )
        ? "INTERVIEW_NOT_YET_HELD"
        : reasons.includes("INTERVIEW_NOT_CONFIRMED")
          ? "INTERVIEW_NOT_CONFIRMED"
          : "NO_INTERVIEW";
      return {
        eligible: false,
        reason,
        applicationId: null,
        direction: null,
        revieweeId: null,
        alreadyReviewed: false,
      };
    }

    const reviewed = new Set(
      (
        await this.reviewsRepository.findReviewedApplicationIds(
          userId,
          completed.map((a) => a.id),
        )
      ).map((r) => r.applicationId),
    );
    const open = completed.find((a) => !reviewed.has(a.id));
    // completed is non-empty here (checked above).
    const target = open ?? completed[0]!;
    const isTalent = target.talent.userId === userId;

    return {
      eligible: !!open,
      reason: open ? null : "ALREADY_REVIEWED",
      applicationId: open ? open.id : null,
      direction: this.directionFor(isTalent),
      revieweeId: isTalent ? target.job.employer.userId : target.talent.userId,
      alreadyReviewed: !open,
    };
  }

  async create(userId: string, dto: CreateReviewDto) {
    const party = await this.resolveParty(userId, dto.applicationId);
    if (!party) {
      throw new NotFoundApiException(
        "Application not found",
        ErrorCode.APPLICATION_NOT_FOUND,
      );
    }
    const { application, isTalent } = party;

    if (!this.isEligibleInteraction(application)) {
      throw new ForbiddenApiException(
        "Not eligible to review this interaction",
        ErrorCode.REVIEW_NOT_ELIGIBLE,
      );
    }

    const direction = this.directionFor(isTalent);
    const revieweeId = this.revieweeIdFor(application, isTalent);

    // Structurally shouldn't happen — a talent and an employer are always
    // different accounts — but the whole point of this endpoint is to never
    // trust the request for who's being reviewed, so the derived value gets
    // the same self-review check a client-supplied one would.
    if (revieweeId === userId) {
      throw new BadRequestApiException(
        "Cannot review yourself",
        ErrorCode.REVIEW_SELF_NOT_ALLOWED,
      );
    }

    // Category ratings are direction-specific (see the Review model's
    // schema comment: reliabilityRating is employer-reviewing-talent only,
    // interviewProcessRating is talent-reviewing-employer only). Rejected
    // outright rather than silently dropped, so a caller who got the
    // direction wrong finds out why.
    if (
      direction === "TALENT_TO_EMPLOYER" &&
      dto.reliabilityRating !== undefined
    ) {
      throw new BadRequestApiException(
        "reliabilityRating only applies when an employer reviews a talent",
        ErrorCode.REVIEW_INVALID_CATEGORY,
      );
    }
    if (
      direction === "EMPLOYER_TO_TALENT" &&
      dto.interviewProcessRating !== undefined
    ) {
      throw new BadRequestApiException(
        "interviewProcessRating only applies when a talent reviews an employer",
        ErrorCode.REVIEW_INVALID_CATEGORY,
      );
    }

    // PB71 BR2: no profanity / abusive terms in public review text.
    if (containsBlockedTerm(dto.title, dto.comment)) {
      throw new BadRequestApiException(
        "The review contains language that isn't allowed. Please rephrase it.",
        ErrorCode.REVIEW_CONTENT_REJECTED,
      );
    }

    try {
      return await this.reviewsRepository.create({
        applicationId: dto.applicationId,
        direction,
        reviewerId: userId,
        revieweeId,
        overallRating: dto.overallRating,
        communicationRating: dto.communicationRating,
        professionalismRating: dto.professionalismRating,
        interviewProcessRating: dto.interviewProcessRating,
        reliabilityRating: dto.reliabilityRating,
        title: dto.title,
        comment: dto.comment,
      });
    } catch (error) {
      // The findByReviewerAndApplication check the eligibility endpoint
      // exposes is only ever a fast path for the frontend — a concurrent
      // duplicate submission (double-click, retried request) can still race
      // past any client-side gate and hit the unique constraint here. Same
      // P2002-to-domain-error pattern as ApplicationsService.apply's own
      // duplicate-apply race.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictApiException(
          "Already reviewed this interaction",
          ErrorCode.REVIEW_ALREADY_EXISTS,
        );
      }
      throw error;
    }
  }

  async listForUser(revieweeId: string, query: ListUserReviewsDto) {
    const { page, limit, rating, sort } = query;
    const skip = paginationSkip(page, limit);
    const { reviews, total, filteredTotal, avg, distribution } =
      await this.reviewsRepository.findForRevieweeWithAggregate(
        revieweeId,
        skip,
        limit,
        { rating, sort },
      );

    return {
      averageRating: avg.overallRating,
      totalReviews: total,
      distribution,
      ratings: {
        communication: avg.communicationRating,
        professionalism: avg.professionalismRating,
        interviewProcess: avg.interviewProcessRating,
        reliability: avg.reliabilityRating,
      },
      reviews,
      // Pagination follows the (optionally star-filtered) list.
      pagination: buildPagination(page, limit, filteredTotal),
    };
  }
}
