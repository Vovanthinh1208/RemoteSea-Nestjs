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
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

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

  async getPublicProfile(slug: string): Promise<Record<string, unknown>> {
    const profile = await this.talentRepository.findBySlug(slug);
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.TALENT_PROFILE_NOT_FOUND,
    );
    return TalentMapper.toPublicProfile(profile);
  }

  async upsertProfile(
    userId: string,
    dto: TalentProfileDto,
  ): Promise<TalentProfileWithSkills> {
    const { skills, ...profileData } = dto;
    const user = await this.talentRepository.findUserName(userId);
    assertFound(user, "User not found", ErrorCode.USER_NOT_FOUND);
    const slug = uniqueSlug(user.name ?? "talent");

    // upsertProfileWithSkills only touches fields present in this request (Prisma
    // `update: data`), so a caller that sends just one of the two salary fields
    // must be checked against the *effective* post-update pair, not just this
    // request's fields in isolation.
    const existing = await this.talentRepository.findByUserId(userId);
    const effectiveMin =
      dto.desiredSalaryMin ?? existing?.desiredSalaryMin ?? undefined;
    const effectiveMax =
      dto.desiredSalaryMax ?? existing?.desiredSalaryMax ?? undefined;
    if (
      effectiveMin != null &&
      effectiveMax != null &&
      effectiveMax < effectiveMin
    ) {
      throw new BadRequestApiException(
        "desiredSalaryMax must be greater than or equal to desiredSalaryMin",
        ErrorCode.SALARY_RANGE_INVALID,
      );
    }

    // resumeUrl was only checked with z.string().url() — any URL passed the DTO,
    // completely bypassing the presign flow's content-type allowlist, size cap,
    // and rate limit. Only accept a URL this user could actually have obtained
    // from their own POST /uploads/presign call.
    if (
      dto.resumeUrl &&
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
    // it up.
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
