import { Injectable } from "@nestjs/common";
import { CommentsRepository } from "./comments.repository";
import type { CreateCommentDto } from "./dto/create-comment.dto";

@Injectable()
export class CommentsService {
  constructor(private readonly commentsRepository: CommentsRepository) {}

  async list(applicationId: string) {
    const comments =
      await this.commentsRepository.findAllForApplication(applicationId);
    return { comments };
  }

  create(applicationId: string, authorId: string, dto: CreateCommentDto) {
    return this.commentsRepository.create({
      applicationId,
      authorId,
      body: dto.body,
    });
  }
}
