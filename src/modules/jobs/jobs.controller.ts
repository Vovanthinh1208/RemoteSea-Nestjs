import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { listJobsSchema, type ListJobsDto } from "./dto/list-jobs.dto";
import { createJobSchema, type CreateJobDto } from "./dto/create-job.dto";
import { updateJobSchema, type UpdateJobDto } from "./dto/update-job.dto";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
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
  constructor(private readonly jobsService: JobsService) {}

  @ApiListJobs()
  @Get()
  list(@Query(new ZodValidationPipe(listJobsSchema)) query: ListJobsDto) {
    return this.jobsService.list(query);
  }

  @ApiCreateJob()
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createJobSchema)) body: CreateJobDto,
  ) {
    return this.jobsService.create(user.id, body);
  }

  @ApiGetJobById()
  @Get(":id")
  getById(@Param("id") id: string) {
    return this.jobsService.getActiveById(id);
  }

  @ApiUpdateJob()
  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  update(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateJobSchema)) body: UpdateJobDto,
  ) {
    return this.jobsService.update(id, user, body);
  }
}
