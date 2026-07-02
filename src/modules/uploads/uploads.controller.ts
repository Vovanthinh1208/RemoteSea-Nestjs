import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { UploadsService } from "./uploads.service";
import { presignSchema, type PresignDto } from "./dto/presign.dto";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

@Controller("uploads")
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("presign")
  async presign(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(presignSchema)) body: PresignDto
  ) {
    return this.uploadsService.createPresignedUpload(user.id, body);
  }
}
