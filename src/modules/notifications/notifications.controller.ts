import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import {
  listNotificationsSchema,
  type ListNotificationsDto,
} from "./dto/list-notifications.dto";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiListNotifications,
  ApiUnreadNotificationCount,
  ApiMarkNotificationRead,
  ApiMarkAllNotificationsRead,
  ApiNotificationsTag,
} from "./docs/notifications.swagger";

@ApiNotificationsTag()
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiListNotifications()
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listNotificationsSchema))
    query: ListNotificationsDto,
  ) {
    return this.notificationsService.listForUser(user.id, query);
  }

  @ApiUnreadNotificationCount()
  @Get("unread-count")
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    const count = await this.notificationsService.unreadCount(user.id);
    return { count };
  }

  @ApiMarkNotificationRead()
  @Patch(":id/read")
  markRead(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.notificationsService.markRead(id, user.id);
  }

  @ApiMarkAllNotificationsRead()
  @Patch("read-all")
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    const updated = await this.notificationsService.markAllRead(user.id);
    return { updated };
  }
}
