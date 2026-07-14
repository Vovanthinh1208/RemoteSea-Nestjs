import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AlertsService } from "./alerts.service";
import { createAlertSchema, type CreateAlertDto } from "./dto/create-alert.dto";
import { updateAlertSchema, type UpdateAlertDto } from "./dto/update-alert.dto";
import { CronSecretGuard } from "./guards/cron-secret.guard";
import {
  AlertOwnershipGuard,
  type AlertOwnerOnly,
} from "./guards/alert-ownership.guard";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { CurrentResource } from "@/common/authorization/current-resource.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiAlertsTag,
  ApiCreateAlert,
  ApiDeleteAlert,
  ApiDispatchCron,
  ApiListAlerts,
  ApiUpdateAlert,
} from "./docs/alerts.swagger";

@ApiAlertsTag()
@Controller("alerts")
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @ApiListAlerts()
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.alertsService.listForUser(user.id);
  }

  @ApiCreateAlert()
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAlertSchema)) body: CreateAlertDto,
  ) {
    this.rateLimitService.enforce(
      `alert-create:${user.id}`,
      RATE_LIMITS.CREATE.limit,
      RATE_LIMITS.CREATE.windowMs,
    );
    return this.alertsService.create(user.id, body);
  }

  @ApiUpdateAlert()
  @Patch(":id")
  @UseGuards(JwtAuthGuard, AlertOwnershipGuard)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentResource() alert: AlertOwnerOnly,
    @Body(new ZodValidationPipe(updateAlertSchema)) body: UpdateAlertDto,
  ) {
    this.rateLimitService.enforce(
      `alert-update:${user.id}`,
      RATE_LIMITS.UPDATE.limit,
      RATE_LIMITS.UPDATE.windowMs,
    );
    return this.alertsService.update(alert.id, body);
  }

  @ApiDeleteAlert()
  @Delete(":id")
  @UseGuards(JwtAuthGuard, AlertOwnershipGuard)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentResource() alert: AlertOwnerOnly,
  ) {
    this.rateLimitService.enforce(
      `alert-delete:${user.id}`,
      RATE_LIMITS.DELETE.limit,
      RATE_LIMITS.DELETE.windowMs,
    );
    return this.alertsService.remove(alert.id);
  }

  @ApiDispatchCron()
  @Get("cron/dispatch")
  @UseGuards(CronSecretGuard)
  async dispatchCron() {
    return this.alertsService.dispatchCron();
  }
}
