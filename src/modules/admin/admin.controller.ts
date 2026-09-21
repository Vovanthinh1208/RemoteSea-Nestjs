import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminService } from "./admin.service";
import {
  listEmployersSchema,
  type ListEmployersDto,
} from "./dto/list-employers.dto";
import {
  updateEmployerSchema,
  type UpdateEmployerDto,
} from "./dto/update-employer.dto";
import { listJobsSchema, type ListJobsDto } from "./dto/list-jobs.dto";
import { reviewJobSchema, type ReviewJobDto } from "./dto/review-job.dto";
import { listUsersSchema, type ListUsersDto } from "./dto/list-users.dto";
import { updateUserSchema, type UpdateUserDto } from "./dto/update-user.dto";
import {
  listAuditLogSchema,
  type ListAuditLogDto,
} from "./dto/list-audit-log.dto";
import {
  listJobReportsSchema,
  type ListJobReportsDto,
} from "@/modules/job-reports/dto/list-job-reports.dto";
import {
  resolveJobReportSchema,
  type ResolveJobReportDto,
} from "@/modules/job-reports/dto/resolve-job-report.dto";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/core/decorators/roles.decorator";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { RateLimitService } from "@/common/services/rate-limit.service";
import { RATE_LIMITS as JOB_MODERATION_RATE_LIMITS } from "@/modules/job-moderation/constants";
import {
  ApiAdminTag,
  ApiGetJobModerationFlag,
  ApiRegenerateJobModerationFlag,
  ApiGetRevenue,
  ApiListAuditLog,
  ApiListEmployers,
  ApiListJobs,
  ApiListReports,
  ApiListUsers,
  ApiResolveReport,
  ApiReviewJob,
  ApiUpdateEmployer,
  ApiUpdateUser,
} from "./docs/admin.swagger";

@ApiAdminTag()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @ApiListEmployers()
  @Get("employers")
  async listEmployers(
    @Query(new ZodValidationPipe(listEmployersSchema)) query: ListEmployersDto,
  ) {
    return this.adminService.listEmployers(query);
  }

  @ApiUpdateEmployer()
  @Patch("employers/:id")
  async updateEmployer(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEmployerSchema)) body: UpdateEmployerDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.updateEmployer(id, body, admin);
  }

  @ApiListJobs()
  @Get("jobs")
  async listJobs(
    @Query(new ZodValidationPipe(listJobsSchema)) query: ListJobsDto,
  ) {
    return this.adminService.listJobs(query);
  }

  @ApiReviewJob()
  @Patch("jobs/:id")
  async reviewJob(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reviewJobSchema)) body: ReviewJobDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.reviewJob(id, body, admin);
  }

  @ApiGetJobModerationFlag()
  @Get("jobs/:id/moderation-flag")
  getJobModerationFlag(
    @Param("id") id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    this.rateLimitService.enforce(
      `job-moderation:${admin.id}`,
      JOB_MODERATION_RATE_LIMITS.GET_MODERATION_FLAG.limit,
      JOB_MODERATION_RATE_LIMITS.GET_MODERATION_FLAG.windowMs,
    );
    return this.adminService.getJobModerationFlag(id);
  }

  // Same rate-limit bucket as the GET above — regenerating is still just a
  // paid LLM call gated by the same per-admin budget, not a separate
  // allowance to enforce.
  @ApiRegenerateJobModerationFlag()
  @Post("jobs/:id/moderation-flag/regenerate")
  regenerateJobModerationFlag(
    @Param("id") id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    this.rateLimitService.enforce(
      `job-moderation:${admin.id}`,
      JOB_MODERATION_RATE_LIMITS.GET_MODERATION_FLAG.limit,
      JOB_MODERATION_RATE_LIMITS.GET_MODERATION_FLAG.windowMs,
    );
    return this.adminService.regenerateJobModerationFlag(id);
  }

  @ApiGetRevenue()
  @Get("revenue")
  async getRevenue() {
    return this.adminService.getRevenue();
  }

  @ApiListReports()
  @Get("reports")
  async listReports(
    @Query(new ZodValidationPipe(listJobReportsSchema))
    query: ListJobReportsDto,
  ) {
    return this.adminService.listReports(query);
  }

  @ApiResolveReport()
  @Patch("reports/:id")
  async resolveReport(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolveJobReportSchema))
    body: ResolveJobReportDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.resolveReport(id, body, admin);
  }

  @ApiListAuditLog()
  @Get("audit-log")
  async listAuditLog(
    @Query(new ZodValidationPipe(listAuditLogSchema)) query: ListAuditLogDto,
  ) {
    return this.adminService.listAuditLog(query);
  }

  @ApiListUsers()
  @Get("users")
  async listUsers(
    @Query(new ZodValidationPipe(listUsersSchema)) query: ListUsersDto,
  ) {
    return this.adminService.listUsers(query);
  }

  @ApiUpdateUser()
  @Patch("users/:id")
  async updateUser(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.updateUser(id, body, admin);
  }
}
