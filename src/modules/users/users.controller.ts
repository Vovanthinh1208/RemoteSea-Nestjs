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
import { CurrentSessionId } from "@/core/decorators/current-session-id.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import { AuthService } from "@/modules/auth/auth.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiChangePassword,
  ApiDeleteAccount,
  ApiDisconnectConnection,
  ApiExportData,
  ApiGetAccount,
  ApiGetNotificationPreferences,
  ApiGetPauseState,
  ApiListConnections,
  ApiListSessions,
  ApiPauseAccount,
  ApiReactivateAccount,
  ApiRevokeOtherSessions,
  ApiRevokeSession,
  ApiUpdateAccount,
  ApiUpdateNotificationPreferences,
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
    private readonly authService: AuthService,
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
  @ApiGetAccount()
  @Get("account")
  async getAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getAccount(user.id);
  }

  @ApiUpdateAccount()
  @Patch("account")
  async updateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateAccountSchema)) body: UpdateAccountDto,
  ) {
    return this.usersService.updateAccount(user.id, body);
  }

  // Settings > Notifications.
  @ApiGetNotificationPreferences()
  @Get("notification-preferences")
  async getNotificationPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getNotificationPreferences(user.id);
  }

  @ApiUpdateNotificationPreferences()
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
  @ApiGetPauseState()
  @Get("pause")
  async getPauseState(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPauseState(user.id);
  }

  @ApiPauseAccount()
  @Post("pause")
  async pauseAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.pauseAccount(user.id);
  }

  @ApiReactivateAccount()
  @Post("reactivate")
  async reactivateAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.reactivateAccount(user.id);
  }

  // Settings > Privacy & data "Download your data".
  @ApiExportData()
  @Get("export")
  async exportData(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.exportData(user.id);
  }

  // Settings > Connected accounts.
  @ApiListConnections()
  @Get("connections")
  async listConnections(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listConnections(user.id);
  }

  @ApiDisconnectConnection()
  @Delete("connections/:provider")
  async disconnectConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param("provider") provider: string,
  ) {
    await this.usersService.disconnectConnection(user.id, provider);
    return { success: true };
  }

  // Settings > Security > Active sessions.
  @ApiListSessions()
  @Get("sessions")
  async listSessions(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSessionId() sessionId: string,
  ) {
    return this.authService.listSessions(user.id, sessionId);
  }

  @ApiRevokeSession()
  @Delete("sessions/:id")
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSessionId() sessionId: string,
    @Param("id") id: string,
  ) {
    await this.authService.revokeSession(user.id, id, sessionId);
    return { success: true };
  }

  // "Sign out of all other sessions" — no :id, revokes every session except
  // the caller's own.
  @ApiRevokeOtherSessions()
  @Delete("sessions")
  async revokeOtherSessions(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSessionId() sessionId: string,
  ) {
    return this.authService.revokeOtherSessions(user.id, sessionId);
  }
}
