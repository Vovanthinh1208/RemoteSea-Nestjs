import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { EmployerService } from "./employer.service";
import {
  createEmployerProfileSchema,
  type CreateEmployerProfileDto,
} from "./dto/create-employer-profile.dto";
import {
  updateEmployerProfileSchema,
  type UpdateEmployerProfileDto,
} from "./dto/update-employer-profile.dto";
import {
  listEmployerJobsSchema,
  type ListEmployerJobsDto,
} from "./dto/list-employer-jobs.dto";
import {
  listJobApplicationsSchema,
  type ListJobApplicationsDto,
} from "./dto/list-job-applications.dto";
import {
  updateApplicationSchema,
  type UpdateApplicationDto,
} from "./dto/update-application.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/core/decorators/roles.decorator";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { CurrentResource } from "@/common/authorization/current-resource.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  EmployerJobOwnershipGuard,
  type JobOwnerOnly,
} from "./guards/employer-job-ownership.guard";
import {
  ApplicationOwnershipGuard,
  type ApplicationWithJobOwner,
} from "./guards/application-ownership.guard";
import {
  ApiCreateEmployerProfile,
  ApiEmployerTag,
  ApiGetEmployerProfile,
  ApiListEmployerJobs,
  ApiListJobApplications,
  ApiUpdateApplication,
  ApiUpdateEmployerProfile,
} from "./docs/employer.swagger";

@ApiEmployerTag()
@Controller("employer")
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployerController {
  constructor(
    private readonly employerService: EmployerService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  // Deliberately no @Roles("EMPLOYER") here, unlike every other route below —
  // this is the "become an employer" action itself. EmployerRepository.
  // createProfileForUser() promotes the caller's role to EMPLOYER in the same
  // transaction that creates the profile, so requiring the EMPLOYER role to
  // reach this endpoint would make it uncallable by the TALENT/no-employer-
  // profile-yet users it exists for.
  @ApiCreateEmployerProfile()
  @Post("profile")
  @HttpCode(HttpStatus.CREATED)
  async createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createEmployerProfileSchema))
    body: CreateEmployerProfileDto,
  ) {
    this.rateLimitService.enforce(
      `employer-create-profile:${user.id}`,
      RATE_LIMITS.CREATE_PROFILE.limit,
      RATE_LIMITS.CREATE_PROFILE.windowMs,
    );
    return this.employerService.createProfile(user.id, body);
  }

  @ApiGetEmployerProfile()
  @Get("profile")
  @Roles("EMPLOYER")
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.employerService.getProfile(user.id);
  }

  @ApiUpdateEmployerProfile()
  @Patch("profile")
  @Roles("EMPLOYER")
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateEmployerProfileSchema))
    body: UpdateEmployerProfileDto,
  ) {
    this.rateLimitService.enforce(
      `employer-update-profile:${user.id}`,
      RATE_LIMITS.UPDATE_PROFILE.limit,
      RATE_LIMITS.UPDATE_PROFILE.windowMs,
    );
    return this.employerService.updateProfile(user.id, body);
  }

  @ApiListEmployerJobs()
  @Get("jobs")
  @Roles("EMPLOYER")
  async listJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listEmployerJobsSchema))
    query: ListEmployerJobsDto,
  ) {
    return this.employerService.listJobs(user.id, query);
  }

  @ApiListJobApplications()
  @Get("jobs/:id/applications")
  @Roles("EMPLOYER")
  @UseGuards(EmployerJobOwnershipGuard)
  async listJobApplications(
    @CurrentResource() job: JobOwnerOnly,
    @Query(new ZodValidationPipe(listJobApplicationsSchema))
    query: ListJobApplicationsDto,
  ) {
    return this.employerService.listJobApplications(job.id, query);
  }

  @ApiUpdateApplication()
  @Patch("applications/:id")
  @Roles("EMPLOYER")
  @UseGuards(ApplicationOwnershipGuard)
  async updateApplication(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentResource() application: ApplicationWithJobOwner,
    @Body(new ZodValidationPipe(updateApplicationSchema))
    body: UpdateApplicationDto,
  ) {
    this.rateLimitService.enforce(
      `employer-update-application:${user.id}`,
      RATE_LIMITS.UPDATE_APPLICATION.limit,
      RATE_LIMITS.UPDATE_APPLICATION.windowMs,
    );
    return this.employerService.updateApplication(application, body);
  }
}
