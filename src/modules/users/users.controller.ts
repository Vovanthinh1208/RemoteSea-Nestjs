import { Body, Controller, Delete, Patch, Post, UseGuards } from "@nestjs/common";
import { UsersService } from "./users.service";
import { updateUserSchema, type UpdateUserDto } from "./dto/update-user.dto";
import { changePasswordSchema, type ChangePasswordDto } from "./dto/change-password.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

@Controller("users/me")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rateLimitService: RateLimitService
  ) {}

  @Patch()
  async updateName(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserDto
  ) {
    return this.usersService.updateName(user.id, body);
  }

  @Delete()
  async deleteAccount(@CurrentUser() user: AuthenticatedUser) {
    await this.usersService.deleteAccount(user.id);
    return { success: true };
  }

  @Post("password")
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordDto
  ) {
    this.rateLimitService.enforce(
      `password:${user.id}`,
      RATE_LIMITS.CHANGE_PASSWORD.limit,
      RATE_LIMITS.CHANGE_PASSWORD.windowMs
    );
    return this.usersService.changePassword(user.id, body);
  }
}
