import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { UploadsService } from "./uploads.service";
import { presignSchema, type PresignDto } from "./dto/presign.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { ApiPresign, ApiUploadsTag } from "./docs/uploads.swagger";

@ApiUploadsTag()
@Controller("uploads")
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly rateLimitService: RateLimitService
  ) {}

  @ApiPresign()
  @Post("presign")
  async presign(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(presignSchema)) body: PresignDto
  ) {
    this.rateLimitService.enforce(
      `presign:${user.id}`,
      RATE_LIMITS.PRESIGN.limit,
      RATE_LIMITS.PRESIGN.windowMs
    );
    return this.uploadsService.createPresignedUpload(user.id, body);
  }
}
