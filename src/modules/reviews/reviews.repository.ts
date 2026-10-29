import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  partnerApplicationSelect,
  reviewApplicationSelect,
  reviewListItemSelect,
  type CreateReviewInput,
  type PartnerApplication,
  type ReviewApplicationContext,
  type ReviewListItem,
  type ReviewRatingAverages,
} from "./interfaces";

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findApplicationForReview(
    id: string,
  ): Promise<ReviewApplicationContext | null> {
    return this.prisma.application.findUnique({
      where: { id },
      select: reviewApplicationSelect,
    });
  }

  // PB70: applications where the caller and the partner sit on opposite
  // sides (talent vs. the company account that owns the job).
  findApplicationsBetween(
    userId: string,
    partnerId: string,
  ): Promise<PartnerApplication[]> {
    return this.prisma.application.findMany({
      where: {
        OR: [
          {
            talent: { userId },
            job: { employer: { userId: partnerId } },
          },
          {
            talent: { userId: partnerId },
            job: { employer: { userId } },
          },
        ],
      },
      orderBy: { appliedAt: "desc" },
      select: partnerApplicationSelect,
    });
  }

  findReviewedApplicationIds(
    reviewerId: string,
    applicationIds: string[],
  ): Promise<{ applicationId: string }[]> {
    return this.prisma.review.findMany({
      where: { reviewerId, applicationId: { in: applicationIds } },
      select: { applicationId: true },
    });
  }

  findByReviewerAndApplication(
    reviewerId: string,
    applicationId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.review.findUnique({
      where: { reviewerId_applicationId: { reviewerId, applicationId } },
      select: { id: true },
    });
  }

  create(input: CreateReviewInput) {
    return this.prisma.review.create({ data: input });
  }

  // DB-side aggregation (AVG/COUNT), not "load every review and reduce in
  // JS" — the spec's own explicit requirement, and the same reasoning
  // ApplicationsRepository.getStatusCountsByTalentId already uses for its
  // groupBy.
  async findForRevieweeWithAggregate(
    revieweeId: string,
    skip: number,
    take: number,
    options: { rating?: number; sort: "newest" | "oldest" } = {
      sort: "newest",
    },
  ): Promise<{
    reviews: ReviewListItem[];
    total: number;
    filteredTotal: number;
    avg: ReviewRatingAverages;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  }> {
    // Aggregates (average, distribution) always describe every published
    // review; only the listed page follows the PB72 AC3 star filter.
    const where: Prisma.ReviewWhereInput = {
      revieweeId,
      status: "PUBLISHED",
    };
    const listWhere: Prisma.ReviewWhereInput = options.rating
      ? { ...where, overallRating: options.rating }
      : where;
    const [reviews, filteredTotal, aggregate, groups] = await Promise.all([
      this.prisma.review.findMany({
        where: listWhere,
        orderBy: { createdAt: options.sort === "oldest" ? "asc" : "desc" },
        skip,
        take,
        select: reviewListItemSelect,
      }),
      this.prisma.review.count({ where: listWhere }),
      this.prisma.review.aggregate({
        where,
        _count: { _all: true },
        _avg: {
          overallRating: true,
          communicationRating: true,
          professionalismRating: true,
          interviewProcessRating: true,
          reliabilityRating: true,
        },
      }),
      // PB72 AC2: star distribution for the chart.
      this.prisma.review.groupBy({
        by: ["overallRating"],
        where,
        _count: { _all: true },
      }),
    ]);

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const group of groups) {
      if (group.overallRating >= 1 && group.overallRating <= 5) {
        distribution[group.overallRating as 1 | 2 | 3 | 4 | 5] =
          group._count._all;
      }
    }

    return {
      reviews,
      total: aggregate._count._all,
      filteredTotal,
      avg: aggregate._avg,
      distribution,
    };
  }
}
