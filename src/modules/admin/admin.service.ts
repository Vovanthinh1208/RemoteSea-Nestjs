import { Injectable } from "@nestjs/common";
import { AdminRepository } from "./admin.repository";
import type { ListEmployersDto } from "./dto/list-employers.dto";
import type { UpdateEmployerDto } from "./dto/update-employer.dto";
import type { ListJobsDto } from "./dto/list-jobs.dto";
import type { ReviewJobDto } from "./dto/review-job.dto";
import type { Pagination } from "./interfaces";
import { NotFoundApiException } from "@/common/exceptions/api.exception";
import { PLAN_PRICES } from "@/common/constants/plan.constants";
import { EmailService } from "@/common/services/email.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly emailService: EmailService
  ) {}

  async listEmployers(query: ListEmployersDto) {
    const { verified, page, limit } = query;
    const skip = (page - 1) * limit;
    const where = verified === undefined ? {} : { isVerified: verified === "true" };

    const [employers, total] = await this.adminRepository.findEmployers(where, skip, limit);

    const data = employers.map(({ jobs, ...rest }) => ({
      ...rest,
      jobCount: rest._count.jobs,
      totalSpend: jobs.reduce((sum, j) => sum + (PLAN_PRICES[j.planType] ?? 0), 0),
    }));

    const pagination: Pagination = { page, limit, total, pages: Math.ceil(total / limit) };
    return { employers: data, pagination };
  }

  async updateEmployer(id: string, dto: UpdateEmployerDto): Promise<{ success: true }> {
    const employer = await this.adminRepository.findEmployerById(id);
    if (!employer) {
      throw new NotFoundApiException("Employer not found");
    }

    if (dto.action === "verify") {
      await this.adminRepository.verifyEmployer(id);
    } else {
      await this.adminRepository.suspendEmployer(id);
    }

    return { success: true };
  }

  async listJobs(query: ListJobsDto) {
    const { status, page, limit } = query;
    const skip = (page - 1) * limit;
    const where = { status };

    const [jobs, total] = await this.adminRepository.findJobs(where, skip, limit);

    const pagination: Pagination = { page, limit, total, pages: Math.ceil(total / limit) };
    return { jobs, pagination };
  }

  async reviewJob(id: string, dto: ReviewJobDto) {
    const job = await this.adminRepository.findJobWithEmployerEmail(id);
    if (!job) {
      throw new NotFoundApiException("Job not found");
    }

    const { action, note } = dto;
    const employerEmail = job.employer.user.email;

    if (action === "approve") {
      const updated = await this.adminRepository.approveJob(id);
      await this.emailService.sendJobLiveEmail(employerEmail, job.title, job.slug);
      return updated;
    }

    const updated = await this.adminRepository.rejectJob(id, note ?? null);
    await this.emailService.sendJobRejectedEmail(employerEmail, job.title, note ?? "");
    return updated;
  }
}
