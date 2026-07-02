import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AlertsService } from "./alerts.service";
import { createAlertSchema, type CreateAlertDto } from "./dto/create-alert.dto";
import { updateAlertSchema, type UpdateAlertDto } from "./dto/update-alert.dto";
import { CronSecretGuard } from "./guards/cron-secret.guard";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

@Controller("alerts")
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.alertsService.listForUser(user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAlertSchema)) body: CreateAlertDto
  ) {
    return this.alertsService.create(user.id, body);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAlertSchema)) body: UpdateAlertDto
  ) {
    return this.alertsService.update(user.id, id, body);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.alertsService.remove(user.id, id);
  }

  @Get("cron/dispatch")
  @UseGuards(CronSecretGuard)
  async dispatchCron() {
    return this.alertsService.dispatchCron();
  }
}
