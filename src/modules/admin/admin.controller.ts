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
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/core/decorators/roles.decorator";
import {
  ApiAdminTag,
  ApiGetRevenue,
  ApiListEmployers,
  ApiListJobs,
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
  ) {
    return this.adminService.updateEmployer(id, body);
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
  ) {
    return this.adminService.reviewJob(id, body);
  }

  @ApiGetRevenue()
  @Get("revenue")
  async getRevenue() {
    return this.adminService.getRevenue();
  }
}
