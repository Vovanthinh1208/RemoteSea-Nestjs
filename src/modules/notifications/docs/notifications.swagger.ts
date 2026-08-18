import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
} from "@/core/swagger/common.responses";
import {
  ListNotificationsResponseDto,
  MarkAllNotificationsReadResponseDto,
  NotificationDto,
  UnreadCountResponseDto,
} from "./notifications.dto";
import {
  MarkAllNotificationsReadExample,
  NotificationExample,
  NotificationsListExample,
  UnreadCountExample,
} from "./notifications.examples";
import {
  NotificationNotFoundResponse,
  ValidationErrorResponse,
} from "./notifications.responses";

export const ApiNotificationsTag = () =>
  applyDecorators(ApiTags("Notifications"));

export const ApiListNotifications = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List my notifications",
      description:
        "Returns the caller's notifications, most recent first. Fed by invitation, application-status-change, and job-report-resolution events — see the Notification model for the full list.",
    }),
    ApiOkResponse({
      description: "The caller's notifications",
      type: ListNotificationsResponseDto,
      schema: { example: NotificationsListExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiUnreadNotificationCount = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Get my unread notification count",
      description:
        "A cheap count-only endpoint, meant to be polled for the navbar bell badge.",
    }),
    ApiOkResponse({
      description: "Unread count",
      type: UnreadCountResponseDto,
      schema: { example: UnreadCountExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiMarkNotificationRead = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Mark one notification as read",
      description:
        "Only affects a notification owned by the caller — anything else (wrong owner or nonexistent id) returns 404. Idempotent — marking an already-read notification just bumps its readAt.",
    }),
    ApiParam({ name: "id", type: String, example: "cnot1a2b0000ug0h9x1n1a2" }),
    ApiOkResponse({
      description: "The updated notification",
      type: NotificationDto,
      schema: { example: NotificationExample },
    }),
    NotificationNotFoundResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiMarkAllNotificationsRead = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Mark all my notifications as read",
      description: "Returns how many rows were updated.",
    }),
    ApiOkResponse({
      description: "Count of notifications marked read",
      type: MarkAllNotificationsReadResponseDto,
      schema: { example: MarkAllNotificationsReadExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );
