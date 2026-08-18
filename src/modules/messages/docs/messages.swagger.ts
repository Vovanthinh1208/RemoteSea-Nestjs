import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  ForbiddenApiResponse,
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";
import {
  MessageResponseDto,
  SendMessageRequestDto,
  ThreadResponseDto,
} from "./messages.dto";
import { MessageExample, ThreadExample } from "./messages.examples";
import {
  ApplicationAccessDeniedResponse,
  ApplicationNotFoundResponse,
  ValidationErrorResponse,
} from "./messages.responses";

export const ApiMessagesTag = () => applyDecorators(ApiTags("Messages"));

export const ApiListMessages = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List messages on an application",
      description:
        "Only the application's talent or its job's employer may call this. Returns the thread oldest-first, capped at the most recent 200 messages (no pagination for MVP), bundled with header context (job title, both parties' display names) so the caller doesn't need a separate lookup.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiOkResponse({
      description: "The thread's messages (oldest first) plus header context",
      type: ThreadResponseDto,
      schema: { example: ThreadExample },
    }),
    ApplicationNotFoundResponse,
    ApplicationAccessDeniedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiSendMessage = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Send a message on an application",
      description:
        "Only the application's talent or its job's employer may call this. Notifies the other party via the Notification Center — not gated by NotificationPreference, same as every other in-app notification.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiBody({
      type: SendMessageRequestDto,
      examples: { default: { value: { body: MessageExample.body } } },
    }),
    ApiCreatedResponse({
      description: "Message sent",
      type: MessageResponseDto,
      schema: { example: MessageExample },
    }),
    ValidationErrorResponse,
    ApplicationNotFoundResponse,
    ApplicationAccessDeniedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    rateLimitResponse("30/hour"),
    InternalServerErrorApiResponse,
  );
