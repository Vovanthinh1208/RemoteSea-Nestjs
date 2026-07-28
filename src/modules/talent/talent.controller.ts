import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
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
import { AuthService } from "@/modules/auth/auth.service";
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
    private readonly authService: AuthService,
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
  async getPublicProfile(@Param("slug") slug: string, @Req() req: Request) {
    // Unauthenticated by design (no JwtAuthGuard) — a Bearer token is
    // optional here, only consulted to decide whether a VERIFIED_EMPLOYERS
    // profile is visible to this specific caller.
    const viewer = this.authService.verifySession(req.headers.authorization);
    return this.talentService.getPublicProfile(slug, viewer);
  }
}
