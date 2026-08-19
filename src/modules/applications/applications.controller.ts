import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApplicationsService } from "./applications.service";
import { applySchema, type ApplyDto } from "./dto/apply.dto";
import {
  listApplicationsSchema,
  type ListApplicationsDto,
} from "./dto/list-applications.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CronSecretGuard } from "@/modules/alerts/guards/cron-secret.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiApplicationsTag,
  ApiApply,
  ApiDispatchBacklogReminders,
  ApiGetApplication,
  ApiListApplications,
} from "./docs/applications.swagger";

@ApiApplicationsTag()
@Controller("applications")
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @ApiListApplications()
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listApplicationsSchema))
    query: ListApplicationsDto,
  ) {
    return this.applicationsService.findAllForUser(
      user.id,
      query.page,
      query.limit,
    );
  }

  // Static path segment — doesn't collide with any :id-style route (there is none
  // in this controller). DB-side aggregate for TalentDashboard's stat tiles.
  @Get("stats")
  @UseGuards(JwtAuthGuard)
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.applicationsService.getStatusCounts(user.id);
  }

  // Membership set for "already applied?" checks (ApplyButton) — the twin of
  // GET /saved/ids. Static segment, no :id routes here to collide with.
  @Get("ids")
  @UseGuards(JwtAuthGuard)
  async listIds(@CurrentUser() user: AuthenticatedUser) {
    const jobIds = await this.applicationsService.getAppliedJobIds(user.id);
    return { jobIds };
  }

  @ApiApply()
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(applySchema)) body: ApplyDto,
  ) {
    this.rateLimitService.enforce(
      `apply:${user.id}`,
      RATE_LIMITS.APPLY.limit,
      RATE_LIMITS.APPLY.windowMs,
    );
    return this.applicationsService.apply(user.id, body);
  }

  // Employer Response SLA — external scheduler only (CronSecretGuard, same
  // as alerts/cron/dispatch), never a user JWT.
  @ApiDispatchBacklogReminders()
  @Get("cron/reminders")
  @UseGuards(CronSecretGuard)
  dispatchBacklogReminders() {
    return this.applicationsService.dispatchBacklogReminders();
  }

  // Declared last — a dynamic :id segment registered above the static
  // "stats"/"ids" routes would swallow those literal paths instead.
  @ApiGetApplication()
  @Get(":id")
  @UseGuards(JwtAuthGuard)
  getById(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.applicationsService.getOwnApplication(user.id, id);
  }
}
