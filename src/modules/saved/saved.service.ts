import { Injectable } from "@nestjs/common";
import { SavedRepository } from "./saved.repository";
import type { SavedJobWithJob, ToggleSavedResult } from "./interfaces";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import type { Pagination } from "@/common/interfaces/pagination.interface";

@Injectable()
export class SavedService {
  constructor(private readonly savedRepository: SavedRepository) {}

  async findAllForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ savedJobs: SavedJobWithJob[]; pagination: Pagination }> {
    const skip = paginationSkip(page, limit);
    const [savedJobs, total] = await this.savedRepository.findAllForUser(
      userId,
      skip,
      limit,
    );
    return { savedJobs, pagination: buildPagination(page, limit, total) };
  }

  findJobIdsForUser(userId: string): Promise<string[]> {
    return this.savedRepository.findJobIdsForUser(userId);
  }

  async save(userId: string, jobId: string): Promise<ToggleSavedResult> {
    await this.savedRepository.save(userId, jobId);
    return { saved: true };
  }

  async unsave(userId: string, jobId: string): Promise<ToggleSavedResult> {
    await this.savedRepository.delete(userId, jobId);
    return { saved: false };
  }
}
