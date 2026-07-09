import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  EmployerRepository,
  type ProfileWithApplicationCounts,
  type PublicEmployerProfile,
} from "./employer.repository";
import { ALLOWED_TRANSITIONS } from "./constants";
import type { CreateEmployerProfileDto } from "./dto/create-employer-profile.dto";
import type { UpdateEmployerProfileDto } from "./dto/update-employer-profile.dto";
import type { ListEmployerJobsDto } from "./dto/list-employer-jobs.dto";
import type { ListJobApplicationsDto } from "./dto/list-job-applications.dto";
import type { UpdateApplicationDto } from "./dto/update-application.dto";
import { slugify, withUniqueSuffix } from "@/common/utils/slugify";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import { assertFound } from "@/common/utils/assert-found";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
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
    const slug = taken ? withUniqueSuffix(base) : base;

    try {
      return await this.employerRepository.createProfileForUser(userId, dto, slug);
    } catch (error) {
      // Two concurrent signups for the same company name can both pass the
      // findProfileBySlug check above before either writes — retry once with a
      // guaranteed-unique slug instead of surfacing a raw conflict to the loser.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.employerRepository.createProfileForUser(userId, dto, withUniqueSuffix(base));
      }
      throw error;
    }
  }

  async getProfile(
    userId: string
  ): Promise<Omit<ProfileWithApplicationCounts, "jobs"> & { totalApplications: number }> {
    const profile = await this.employerRepository.findProfileWithApplicationCounts(userId);
    assertFound(profile, "Profile not found");

    const { jobs, ...rest } = profile;
    const totalApplications = jobs.reduce((sum, j) => sum + j._count.applications, 0);

    return { ...rest, totalApplications };
  }

  async updateProfile(userId: string, dto: UpdateEmployerProfileDto): Promise<PublicEmployerProfile> {
    const profile = await this.employerRepository.findProfileByUserId(userId);
    assertFound(profile, "Profile not found");

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
    assertFound(job, "Job not found");
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
    assertFound(application, "Application not found");
    if (application.job.employer.userId !== userId) {
      throw new ForbiddenApiException();
    }

    const { status, notes } = dto;
    if (status !== application.status && !ALLOWED_TRANSITIONS[application.status].includes(status)) {
      throw new BadRequestApiException(`Cannot transition from ${application.status} to ${status}`);
    }

    const updated = await this.employerRepository.updateApplication(
      applicationId,
      application.status,
      status,
      notes
    );
    if (!updated) {
      throw new ConflictApiException("Application was updated concurrently — please refresh and try again");
    }
    return updated;
  }
}
