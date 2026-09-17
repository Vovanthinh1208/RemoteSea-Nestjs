import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { InterviewsService } from "./interviews.service";
import {
  confirmInterviewSchema,
  type ConfirmInterviewDto,
} from "./dto/confirm-interview.dto";
import { RATE_LIMITS } from "./constants";
import {
  TalentApplicationOwnershipGuard,
  type TalentApplicationOwner,
} from "./guards/talent-application-ownership.guard";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/core/decorators/roles.decorator";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { CurrentResource } from "@/common/authorization/current-resource.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiConfirmInterview,
  ApiGetInterview,
  ApiGetInterviewIcs,
  ApiInterviewsTag,
} from "./docs/interviews.swagger";

@ApiInterviewsTag()
@Controller("applications")
@UseGuards(JwtAuthGuard, RolesGuard, TalentApplicationOwnershipGuard)
@Roles("TALENT")
export class InterviewsController {
  constructor(
    private readonly interviewsService: InterviewsService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @ApiGetInterview()
  @Get(":id/interview")
  get(@CurrentResource() application: TalentApplicationOwner) {
    return this.interviewsService.get(application);
  }

  // Registered after ":id/interview" — Nest matches routes in declaration
  // order and both are static suffixes off the same dynamic :id segment, so
  // this would never be shadowed either way, but keeping the plain GET
  // first mirrors every other controller's convention in this codebase.
  @ApiGetInterviewIcs()
  @Get(":id/interview/ics")
  @Header("Content-Type", "text/calendar; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="interview.ics"')
  getIcs(@CurrentResource() application: TalentApplicationOwner) {
    return this.interviewsService.getIcsFile(application);
  }

  @ApiConfirmInterview()
  @Patch(":id/interview/confirm")
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentResource() application: TalentApplicationOwner,
    @Body(new ZodValidationPipe(confirmInterviewSchema))
    body: ConfirmInterviewDto,
  ) {
    this.rateLimitService.enforce(
      `confirm-interview:${user.id}`,
      RATE_LIMITS.CONFIRM_INTERVIEW.limit,
      RATE_LIMITS.CONFIRM_INTERVIEW.windowMs,
    );
    return this.interviewsService.confirm(application, body);
  }
}
