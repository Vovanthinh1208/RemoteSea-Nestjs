import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { updateUserSchema, type UpdateUserDto } from "./dto/update-user.dto";
import {
  changePasswordSchema,
  type ChangePasswordDto,
} from "./dto/change-password.dto";
import {
  updateAccountSchema,
  type UpdateAccountDto,
} from "./dto/update-account.dto";
import {
  updateNotificationPreferencesSchema,
  type UpdateNotificationPreferencesDto,
} from "./dto/update-notification-preferences.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiChangePassword,
  ApiDeleteAccount,
  ApiUpdateUserName,
  ApiUsersTag,
} from "./docs/users.swagger";

@ApiUsersTag()
@Controller("users/me")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @ApiUpdateUserName()
  @Patch()
  async updateName(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserDto,
  ) {
    return this.usersService.updateName(user.id, body);
  }

  @ApiDeleteAccount()
  @Delete()
  async deleteAccount(@CurrentUser() user: AuthenticatedUser) {
    await this.usersService.deleteAccount(user.id);
    return { success: true };
  }

  @ApiChangePassword()
  @Post("password")
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordDto,
  ) {
    this.rateLimitService.enforce(
      `password:${user.id}`,
      RATE_LIMITS.CHANGE_PASSWORD.limit,
      RATE_LIMITS.CHANGE_PASSWORD.windowMs,
    );
    return this.usersService.changePassword(user.id, body);
  }

  // Settings > Account (phone/language/region/currency display).
  @Get("account")
  async getAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getAccount(user.id);
  }

  @Patch("account")
  async updateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateAccountSchema)) body: UpdateAccountDto,
  ) {
    return this.usersService.updateAccount(user.id, body);
  }

  // Settings > Notifications.
  @Get("notification-preferences")
  async getNotificationPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getNotificationPreferences(user.id);
  }

  @Patch("notification-preferences")
  async updateNotificationPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateNotificationPreferencesSchema))
    body: UpdateNotificationPreferencesDto,
  ) {
    return this.usersService.updateNotificationPreferences(user.id, body);
  }

  // Settings > Danger zone "Pause my account" (reversible — see DeleteAccount
  // above for the permanent version).
  @Get("pause")
  async getPauseState(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPauseState(user.id);
  }

  @Post("pause")
  async pauseAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.pauseAccount(user.id);
  }

  @Post("reactivate")
  async reactivateAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.reactivateAccount(user.id);
  }

  // Settings > Privacy & data "Download your data".
  @Get("export")
  async exportData(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.exportData(user.id);
  }

  // Settings > Connected accounts.
  @Get("connections")
  async listConnections(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listConnections(user.id);
  }

  @Delete("connections/:provider")
  async disconnectConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param("provider") provider: string,
  ) {
    await this.usersService.disconnectConnection(user.id, provider);
    return { success: true };
  }
}
