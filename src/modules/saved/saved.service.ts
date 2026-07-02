import { Injectable } from "@nestjs/common";
import { SavedRepository } from "./saved.repository";
import type { SaveJobDto } from "./dto/save-job.dto";
import type { SavedJobWithJob, ToggleSavedResult } from "./interfaces";

@Injectable()
export class SavedService {
  constructor(private readonly savedRepository: SavedRepository) {}

  findAllForUser(userId: string): Promise<SavedJobWithJob[]> {
    return this.savedRepository.findAllForUser(userId);
  }

  async toggle(userId: string, dto: SaveJobDto): Promise<{ result: ToggleSavedResult; created: boolean }> {
    const existing = await this.savedRepository.findOne(userId, dto.jobId);

    if (existing) {
      await this.savedRepository.delete(userId, dto.jobId);
      return { result: { saved: false }, created: false };
    }

    await this.savedRepository.create(userId, dto.jobId);
    return { result: { saved: true }, created: true };
  }
}
