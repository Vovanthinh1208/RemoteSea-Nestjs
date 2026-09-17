import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import {
  commentListItemSelect,
  type CommentListItem,
  type CreateCommentInput,
} from "./interfaces";

@Injectable()
export class CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Oldest-first — a discussion thread reads top-to-bottom like the
  // conversation actually happened, same ordering ScorecardsRepository uses
  // for the same reason.
  findAllForApplication(applicationId: string): Promise<CommentListItem[]> {
    return this.prisma.applicationComment.findMany({
      where: { applicationId },
      orderBy: { createdAt: "asc" },
      select: commentListItemSelect,
    });
  }

  create(input: CreateCommentInput): Promise<CommentListItem> {
    return this.prisma.applicationComment.create({
      data: input,
      select: commentListItemSelect,
    });
  }
}
