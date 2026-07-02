import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { EmployerService } from "./employer.service";
import { createEmployerProfileSchema, type CreateEmployerProfileDto } from "./dto/create-employer-profile.dto";
import { updateEmployerProfileSchema, type UpdateEmployerProfileDto } from "./dto/update-employer-profile.dto";
import { listEmployerJobsSchema, type ListEmployerJobsDto } from "./dto/list-employer-jobs.dto";
import { listJobApplicationsSchema, type ListJobApplicationsDto } from "./dto/list-job-applications.dto";
import { updateApplicationSchema, type UpdateApplicationDto } from "./dto/update-application.dto";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/core/decorators/roles.decorator";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

@Controller("employer")
export class EmployerController {
  constructor(private readonly employerService: EmployerService) {}

  @Post("profile")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createEmployerProfileSchema)) body: CreateEmployerProfileDto
  ) {
    return this.employerService.createProfile(user.id, body);
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("EMPLOYER")
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.employerService.getProfile(user.id);
  }

  @Patch("profile")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("EMPLOYER")
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateEmployerProfileSchema)) body: UpdateEmployerProfileDto
  ) {
    return this.employerService.updateProfile(user.id, body);
  }

  @Get("jobs")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("EMPLOYER")
  async listJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listEmployerJobsSchema)) query: ListEmployerJobsDto
  ) {
    return this.employerService.listJobs(user.id, query);
  }

  @Get("jobs/:id/applications")
  @UseGuards(JwtAuthGuard)
  async listJobApplications(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(listJobApplicationsSchema)) query: ListJobApplicationsDto
  ) {
    return this.employerService.listJobApplications(user.id, id, query);
  }

  @Patch("applications/:id")
  @UseGuards(JwtAuthGuard)
  async updateApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateApplicationSchema)) body: UpdateApplicationDto
  ) {
    return this.employerService.updateApplication(user.id, id, body);
  }
}
