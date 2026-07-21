import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { JobsService } from "./jobs.service";
import { listJobsSchema, type ListJobsDto } from "./dto/list-jobs.dto";
import { createJobSchema, type CreateJobDto } from "./dto/create-job.dto";
import { updateJobSchema, type UpdateJobDto } from "./dto/update-job.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { CurrentResource } from "@/common/authorization/current-resource.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  JobOwnershipGuard,
  type JobWithOwner,
} from "./guards/job-ownership.guard";
import {
  ApiCreateJob,
  ApiGetJobById,
  ApiJobsTag,
  ApiListJobs,
  ApiUpdateJob,
} from "./docs/jobs.swagger";

@ApiJobsTag()
@Controller("jobs")
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  // Public, identical for every caller, no side effects — lets a CDN/proxy
  // absorb repeats for 60s (matching the facets cache TTL) while browsers
  // still revalidate (max-age=0; client staleness is React Query's job).
  // The job *detail* route deliberately has no cache header: it increments
  // viewCount per request, and a CDN hit would silently skip that.
  @ApiListJobs()
  @Get()
  @Header(
    "Cache-Control",
    "public, max-age=0, s-maxage=60, stale-while-revalidate=30",
  )
  list(@Query(new ZodValidationPipe(listJobsSchema)) query: ListJobsDto) {
    return this.jobsService.list(query);
  }

  @ApiCreateJob()
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createJobSchema)) body: CreateJobDto,
  ) {
    this.rateLimitService.enforce(
      `job-create:${user.id}`,
      RATE_LIMITS.CREATE.limit,
      RATE_LIMITS.CREATE.windowMs,
      req,
    );
    return this.jobsService.create(user.id, body);
  }

  @ApiGetJobById()
  @Get(":id")
  getById(@Param("id") id: string) {
    return this.jobsService.getActiveById(id);
  }

  @ApiUpdateJob()
  @Patch(":id")
  @UseGuards(JwtAuthGuard, JobOwnershipGuard)
  update(
    @Req() req: Request,
    @CurrentResource() job: JobWithOwner,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateJobSchema)) body: UpdateJobDto,
  ) {
    this.rateLimitService.enforce(
      `job-update:${user.id}`,
      RATE_LIMITS.UPDATE.limit,
      RATE_LIMITS.UPDATE.windowMs,
      req,
    );
    return this.jobsService.update(job, user, body);
  }
}
