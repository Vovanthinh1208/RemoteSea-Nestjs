import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import {
  ApiAdminTag,
  ApiGetRevenue,
  ApiListEmployers,
  ApiListJobs,
  ApiListReports,
  ApiResolveReport,
  ApiReviewJob,
  ApiUpdateEmployer,
} from "./docs/admin.swagger";

@ApiAdminTag()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
    return this.adminService.updateEmployer(id, body, admin.id);
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
    return this.adminService.reviewJob(id, body, admin.id);
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
    return this.adminService.resolveReport(id, body, admin.id);
  }
}
