import { Injectable } from "@nestjs/common";
import { nanoid } from "nanoid";
import type { EmployerProfile } from "@prisma/client";
import { EmployerRepository } from "./employer.repository";
import { ALLOWED_TRANSITIONS } from "./constants";
import type { CreateEmployerProfileDto } from "./dto/create-employer-profile.dto";
import type { UpdateEmployerProfileDto } from "./dto/update-employer-profile.dto";
import type { ListEmployerJobsDto } from "./dto/list-employer-jobs.dto";
import type { ListJobApplicationsDto } from "./dto/list-job-applications.dto";
import type { UpdateApplicationDto } from "./dto/update-application.dto";
import { slugify } from "@/common/utils/slugify";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";

@Injectable()
export class EmployerService {
  constructor(private readonly employerRepository: EmployerRepository) {}

  async createProfile(
    userId: string,
    dto: CreateEmployerProfileDto
  ): Promise<{ id: string; slug: string; companyName: string }> {
    const existing = await this.employerRepository.findProfileByUserId(userId);
    if (existing) {
      throw new ConflictApiException("Employer profile already exists");
    }

    const base = slugify(dto.companyName);
    const taken = await this.employerRepository.findProfileBySlug(base);
    const slug = taken ? `${base}-${nanoid(6)}` : base;

    return this.employerRepository.createProfileForUser(userId, dto, slug);
  }

  async getProfile(userId: string): Promise<Record<string, unknown>> {
    const profile = await this.employerRepository.findProfileWithApplicationCounts(userId);
    if (!profile) {
      throw new NotFoundApiException("Profile not found");
    }

    const { jobs, ...rest } = profile;
    const totalApplications = jobs.reduce((sum, j) => sum + j._count.applications, 0);

    return { ...rest, totalApplications };
  }

  async updateProfile(userId: string, dto: UpdateEmployerProfileDto): Promise<EmployerProfile> {
    const profile = await this.employerRepository.findProfileByUserId(userId);
    if (!profile) {
      throw new NotFoundApiException("Profile not found");
    }

    return this.employerRepository.updateProfile(profile.id, dto);
  }

  async listJobs(userId: string, dto: ListEmployerJobsDto) {
    const employer = await this.employerRepository.findProfileByUserId(userId);
    if (!employer) {
      throw new ForbiddenApiException("Employer profile required");
    }

    const [jobs, { totalApps, shortlisted, offered }] = await Promise.all([
      this.employerRepository.findJobsByEmployer(employer.id, dto.status),
      this.employerRepository.getEmployerJobStats(employer.id),
    ]);

    const avgTimeToHireInDays = offered.length
      ? offered.reduce(
          (sum, a) => sum + (a.updatedAt.getTime() - a.appliedAt.getTime()) / 86_400_000,
          0
        ) / offered.length
      : 0;

    return {
      jobs,
      stats: {
        totalApps,
        shortlisted,
        avgTimeToHireInDays: Math.round(avgTimeToHireInDays * 10) / 10,
      },
    };
  }

  async listJobApplications(userId: string, jobId: string, dto: ListJobApplicationsDto) {
    const job = await this.employerRepository.findJobWithEmployerOwner(jobId);
    if (!job) {
      throw new NotFoundApiException("Job not found");
    }
    if (job.employer.userId !== userId) {
      throw new ForbiddenApiException();
    }

    const { status, page, limit } = dto;
    const skip = paginationSkip(page, limit);
    const { applications, total } = await this.employerRepository.findApplicationsForJob(
      jobId,
      status,
      skip,
      limit
    );

    return {
      applications,
      pagination: buildPagination(page, limit, total),
    };
  }

  async updateApplication(userId: string, applicationId: string, dto: UpdateApplicationDto) {
    const application = await this.employerRepository.findApplicationWithJobOwner(applicationId);
    if (!application) {
      throw new NotFoundApiException("Application not found");
    }
    if (application.job.employer.userId !== userId) {
      throw new ForbiddenApiException();
    }

    const { status, notes } = dto;
    if (status !== application.status && !ALLOWED_TRANSITIONS[application.status].includes(status)) {
      throw new BadRequestApiException(`Cannot transition from ${application.status} to ${status}`);
    }

    return this.employerRepository.updateApplication(applicationId, status, notes);
  }
}
