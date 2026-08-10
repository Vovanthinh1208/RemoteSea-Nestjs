import type { PublicTalentProfile } from "./interfaces";

export class TalentMapper {
  static toPublicProfile(
    profile: PublicTalentProfile,
  ): Record<string, unknown> {
    // visibility is selected only so TalentService.getPublicProfile can gate
    // on it before this ever runs — not part of the public response shape.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { desiredSalaryMin, desiredSalaryMax, visibility, ...rest } = profile;
    return {
      ...rest,
      ...(profile.isOpenToWork ? { desiredSalaryMin, desiredSalaryMax } : {}),
    };
  }
}
