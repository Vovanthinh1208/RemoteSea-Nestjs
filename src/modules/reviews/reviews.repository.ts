import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  reviewApplicationSelect,
  reviewListItemSelect,
  type CreateReviewInput,
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
  ): Promise<{
    reviews: ReviewListItem[];
    total: number;
    avg: ReviewRatingAverages;
  }> {
    const where: Prisma.ReviewWhereInput = {
      revieweeId,
      status: "PUBLISHED",
    };
    const [reviews, aggregate] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: reviewListItemSelect,
      }),
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
    ]);

    return { reviews, total: aggregate._count._all, avg: aggregate._avg };
  }
}
