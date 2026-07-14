import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { TalentService } from "./talent.service";
import {
  talentProfileSchema,
  type TalentProfileDto,
} from "./dto/update-talent-profile.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiGetOwnProfile,
  ApiGetPublicProfile,
  ApiTalentTag,
  ApiUpsertProfile,
} from "./docs/talent.swagger";

@ApiTalentTag()
@Controller("talent")
export class TalentController {
  constructor(
    private readonly talentService: TalentService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @ApiGetOwnProfile()
  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.talentService.getOwnProfile(user.id);
  }

  @ApiUpsertProfile()
  @Put("me")
  @UseGuards(JwtAuthGuard)
  async upsertProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(talentProfileSchema)) body: TalentProfileDto,
  ) {
    this.rateLimitService.enforce(
      `talent-upsert-profile:${user.id}`,
      RATE_LIMITS.UPSERT_PROFILE.limit,
      RATE_LIMITS.UPSERT_PROFILE.windowMs,
    );
    return this.talentService.upsertProfile(user.id, body);
  }

  @ApiGetPublicProfile()
  @Get(":slug")
  async getPublicProfile(@Param("slug") slug: string) {
    return this.talentService.getPublicProfile(slug);
  }
}
