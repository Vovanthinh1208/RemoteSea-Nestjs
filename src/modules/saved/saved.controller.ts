import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SavedService } from "./saved.service";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { listSavedSchema, type ListSavedDto } from "./dto/list-saved.dto";
import { RATE_LIMITS } from "./constants";
import {
  ApiListSaved,
  ApiSavedTag,
  ApiSaveJob,
  ApiUnsaveJob,
} from "./docs/saved.swagger";

@ApiSavedTag()
@Controller("saved")
@UseGuards(JwtAuthGuard)
export class SavedController {
  constructor(
    private readonly savedService: SavedService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @ApiListSaved()
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listSavedSchema)) query: ListSavedDto,
  ) {
    return this.savedService.findAllForUser(user.id, query.page, query.limit);
  }

  // No pagination — this is an intentionally-complete membership set for
  // client-side "is this job saved?" checks (e.g. the JobCard heart icon),
  // not a display list. Static path segment, doesn't collide with :jobId below.
  @Get("ids")
  async listIds(@CurrentUser() user: AuthenticatedUser) {
    const jobIds = await this.savedService.findJobIdsForUser(user.id);
    return { jobIds };
  }

  @ApiSaveJob()
  @Put(":jobId")
  @HttpCode(HttpStatus.OK)
  save(@CurrentUser() user: AuthenticatedUser, @Param("jobId") jobId: string) {
    this.rateLimitService.enforce(
      `saved-toggle:${user.id}`,
      RATE_LIMITS.TOGGLE.limit,
      RATE_LIMITS.TOGGLE.windowMs,
    );
    return this.savedService.save(user.id, jobId);
  }

  @ApiUnsaveJob()
  @Delete(":jobId")
  @HttpCode(HttpStatus.OK)
  unsave(
    @CurrentUser() user: AuthenticatedUser,
    @Param("jobId") jobId: string,
  ) {
    this.rateLimitService.enforce(
      `saved-toggle:${user.id}`,
      RATE_LIMITS.TOGGLE.limit,
      RATE_LIMITS.TOGGLE.windowMs,
    );
    return this.savedService.unsave(user.id, jobId);
  }
}
