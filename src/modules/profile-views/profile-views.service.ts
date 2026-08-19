import { Injectable } from "@nestjs/common";
import { ProfileViewsRepository } from "./profile-views.repository";
import type { ProfileViewAnalytics } from "./interfaces";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

@Injectable()
export class ProfileViewsService {
  constructor(
    private readonly profileViewsRepository: ProfileViewsRepository,
  ) {}

  // The only entry point that can create a ProfileView row — there is no
  // public/manual API for it. Only a real, authenticated Employer counts:
  // never anonymous (viewer is null), never a Talent (viewing anyone,
  // including — structurally impossible anyway, since accounts are one role
  // — themselves), and the role check alone already rules out a talent
  // viewing their own profile, since a talent's own userId can never carry
  // role EMPLOYER.
  async recordView(
    viewer: AuthenticatedUser | null,
    talentId: string,
  ): Promise<void> {
    if (!viewer || viewer.role !== "EMPLOYER") return;
    await this.profileViewsRepository.recordView(viewer.id, talentId);
  }

  getAnalytics(talentId: string): Promise<ProfileViewAnalytics> {
    return this.profileViewsRepository.getAnalytics(talentId);
  }
}
