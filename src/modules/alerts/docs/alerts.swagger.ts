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
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
} from "@/core/swagger/common.responses";
import {
  AlertResponseDto,
  CreateAlertRequestDto,
  CronDispatchResponseDto,
  DeleteAlertResponseDto,
  UpdateAlertRequestDto,
} from "./alerts.dto";
import {
  AlertListResponseExample,
  AlertResponseExample,
  CreateAlertRequestExample,
  CronDispatchResponseExample,
  DeleteAlertResponseExample,
  UpdateAlertRequestExample,
  UpdateAlertResponseExample,
} from "./alerts.examples";
import {
  AlertNotFoundResponse,
  CronUnauthorizedResponse,
  ValidationErrorResponse,
} from "./alerts.responses";

export const ApiAlertsTag = () => applyDecorators(ApiTags("Alerts"));

export const ApiListAlerts = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List my job alerts",
      description:
        "Lists the current user's job alerts, most recent first, with linked categories.",
    }),
    ApiOkResponse({
      description: "Job alerts",
      type: AlertResponseDto,
      isArray: true,
      schema: { example: AlertListResponseExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiCreateAlert = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Create a job alert",
      description:
        "Creates a new job alert for the current user, optionally attaching category filters.",
    }),
    ApiBody({
      type: CreateAlertRequestDto,
      examples: { default: { value: CreateAlertRequestExample } },
    }),
    ApiCreatedResponse({
      description: "Alert created",
      type: AlertResponseDto,
      schema: { example: AlertResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiUpdateAlert = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Toggle a job alert's active state",
      description:
        "Only `isActive` is mutable via this route. Ownership is enforced in the service — another user's alert 404s rather than 403s.",
    }),
    ApiParam({
      name: "id",
      description: "Alert id (CUID)",
      example: "cme8f1a2b0000ug0h9x1n1a2",
    }),
    ApiBody({
      type: UpdateAlertRequestDto,
      examples: { default: { value: UpdateAlertRequestExample } },
    }),
    ApiOkResponse({
      description: "Alert updated",
      type: AlertResponseDto,
      schema: { example: UpdateAlertResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    AlertNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiDeleteAlert = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Delete a job alert",
      description:
        "Deletes an alert owned by the current user. Ownership is enforced in the service — another user's alert 404s rather than 403s.",
    }),
    ApiParam({
      name: "id",
      description: "Alert id (CUID)",
      example: "cme8f1a2b0000ug0h9x1n1a2",
    }),
    ApiOkResponse({
      description: "Alert deleted",
      type: DeleteAlertResponseDto,
      schema: { example: DeleteAlertResponseExample },
    }),
    UnauthorizedApiResponse,
    AlertNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiDispatchCron = () =>
  applyDecorators(
    ApiOperation({
      summary: "Cron-triggered alert dispatch",
      description:
        "Scans active alerts, finds newly-published matching jobs since each alert's last send (respecting its frequency gap), emails matches, and stamps `lastSentAt`. Meant for an external scheduler, not browser clients. " +
        "**Auth**: not JWT — requires the exact header `Authorization: Bearer <CRON_SECRET>`, checked via a literal string comparison against the `CRON_SECRET` env var.",
    }),
    ApiOkResponse({
      description: "Dispatch summary",
      type: CronDispatchResponseDto,
      schema: { example: CronDispatchResponseExample },
    }),
    CronUnauthorizedResponse,
    InternalServerErrorApiResponse,
  );
