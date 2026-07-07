import { Injectable } from "@nestjs/common";
import { SavedRepository } from "./saved.repository";
import type { SavedJobWithJob, ToggleSavedResult } from "./interfaces";

@Injectable()
export class SavedService {
  constructor(private readonly savedRepository: SavedRepository) {}

  findAllForUser(userId: string): Promise<SavedJobWithJob[]> {
    return this.savedRepository.findAllForUser(userId);
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
