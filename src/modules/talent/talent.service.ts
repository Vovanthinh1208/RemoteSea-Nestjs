import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TalentRepository } from "./talent.repository";
import { TalentMapper } from "./talent.mapper";
import type { TalentProfileDto } from "./dto/update-talent-profile.dto";
import type { OwnTalentProfile, TalentProfileWithSkills } from "./interfaces";
import { uniqueSlug } from "@/common/utils/slugify";
import { assertFound } from "@/common/utils/assert-found";
import { isOwnedUploadUrl } from "@/modules/uploads/upload-url.util";
import { UploadsService } from "@/modules/uploads/uploads.service";
import type { EnvConfig } from "@/core/config/env.validation";
import {
  BadRequestApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { SalaryRange } from "@/modules/jobs/salary-range";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

@Injectable()
export class TalentService {
  constructor(
    private readonly talentRepository: TalentRepository,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly uploadsService: UploadsService,
  ) {}

  async getOwnProfile(userId: string): Promise<OwnTalentProfile> {
    const profile = await this.talentRepository.findByUserId(userId);
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.TALENT_PROFILE_NOT_FOUND,
    );
    return profile;
  }

  async getPublicProfile(
    slug: string,
    viewer: AuthenticatedUser | null,
  ): Promise<Record<string, unknown>> {
    const profile = await this.talentRepository.findBySlug(slug);
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.TALENT_PROFILE_NOT_FOUND,
    );

    if (profile.visibility === "VERIFIED_EMPLOYERS") {
      const allowed =
        viewer?.role === "EMPLOYER" &&
        (await this.talentRepository.isVerifiedEmployer(viewer.id));
      // Same response as a nonexistent slug — doesn't reveal that a profile
      // exists but is gated, just that this caller can't see it here.
      if (!allowed) {
        throw new NotFoundApiException(
          "Profile not found",
          ErrorCode.TALENT_PROFILE_NOT_FOUND,
        );
      }
    }

    return TalentMapper.toPublicProfile(profile);
  }

  async upsertProfile(
    userId: string,
    dto: TalentProfileDto,
  ): Promise<TalentProfileWithSkills> {
    const { skills, ...profileData } = dto;

    // Two independent reads (different tables, no data dependency between them —
    // `slug` only needs `user.name`, the checks below only need `existing`), so
    // they run concurrently instead of one after the other.
    const [user, existing] = await Promise.all([
      this.talentRepository.findUserName(userId),
      // Only the 3 scalars below are read from `existing` — narrow query, not the
      // full skills+user join findByUserId does for the "get my profile" read endpoint.
      this.talentRepository.findSalaryAndResumeByUserId(userId),
    ]);
    assertFound(user, "User not found", ErrorCode.USER_NOT_FOUND);
    const slug = uniqueSlug(user.name ?? "talent");

    // upsertProfileWithSkills only touches fields present in this request (Prisma
    // `update: data`), so a caller that sends just one of the two salary fields
    // must be checked against the *effective* post-update pair, not just this
    // request's fields in isolation. Same rule as JobsService.update's
    // SalaryRange.merge(job, dto) — reuse it instead of re-deriving it here.
    SalaryRange.merge(
      {
        salaryMin: existing?.desiredSalaryMin ?? null,
        salaryMax: existing?.desiredSalaryMax ?? null,
      },
      { salaryMin: dto.desiredSalaryMin, salaryMax: dto.desiredSalaryMax },
    );

    // resumeUrl was only checked with z.string().url() — any URL passed the DTO,
    // completely bypassing the presign flow's content-type allowlist, size cap,
    // and rate limit. Only accept a URL this user could actually have obtained
    // from their own POST /uploads/presign call. Skipped when it's unchanged
    // from what's already stored — that value cleared this same check when it
    // was first set, and every other field on this form (headline, bio, ...)
    // resubmits its current value on every save, so re-validating an untouched
    // resumeUrl here would turn "edit your bio" into "re-prove you own your
    // resume" on every single save.
    if (
      dto.resumeUrl &&
      dto.resumeUrl !== existing?.resumeUrl &&
      !isOwnedUploadUrl(
        dto.resumeUrl,
        this.config.get("CDN_URL", { infer: true }),
        userId,
        "resume",
      )
    ) {
      throw new BadRequestApiException(
        "resumeUrl must be an uploaded file from this account",
        ErrorCode.UPLOAD_URL_NOT_OWNED,
      );
    }

    const profile = await this.talentRepository.upsertProfileWithSkills(
      userId,
      slug,
      profileData,
      skills,
    );

    // Best-effort — a previous resume being replaced would otherwise sit
    // orphaned in the bucket forever, since nothing else in the app ever cleans
    // it up. Bare void (not runInBackground) is safe only because
    // deleteObjectByUrl catches and logs its own failures internally, so this
    // promise never rejects — if that internal handling is ever removed, this
    // becomes an unhandled rejection and should switch to runInBackground.
    if (
      dto.resumeUrl &&
      existing?.resumeUrl &&
      existing.resumeUrl !== dto.resumeUrl
    ) {
      void this.uploadsService.deleteObjectByUrl(existing.resumeUrl);
    }

    const updated = await this.talentRepository.findByIdWithSkills(profile.id);
    assertFound(
      updated,
      "Profile not found",
      ErrorCode.TALENT_PROFILE_NOT_FOUND,
    );
    return updated;
  }
}
