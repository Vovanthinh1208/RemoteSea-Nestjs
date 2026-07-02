import type { PublicTalentProfile } from "./interfaces";

export class TalentMapper {
  static toPublicProfile(profile: PublicTalentProfile): Record<string, unknown> {
    const { desiredSalaryMin, desiredSalaryMax, ...rest } = profile;
    return { ...rest, ...(profile.isOpenToWork ? { desiredSalaryMin, desiredSalaryMax } : {}) };
  }
}
