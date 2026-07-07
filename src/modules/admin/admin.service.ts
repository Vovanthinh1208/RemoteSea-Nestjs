import { Injectable } from "@nestjs/common";
import type { PlanType } from "@prisma/client";
import { AdminRepository } from "./admin.repository";
import type { ListEmployersDto } from "./dto/list-employers.dto";
import type { UpdateEmployerDto } from "./dto/update-employer.dto";
import type { ListJobsDto } from "./dto/list-jobs.dto";
import type { ReviewJobDto } from "./dto/review-job.dto";
import type { Pagination, RevenuePlanMix, RevenueSummary } from "./interfaces";
import { buildRecentMonthKeys, monthKeyOf } from "./revenue.util";
import { NotFoundApiException } from "@/common/exceptions/api.exception";
import { PLAN_LABELS, PLAN_PRICES } from "@/common/constants/plan.constants";
import { EmailService } from "@/common/services/email.service";

const REVENUE_MONTHS_WINDOW = 8;
const RECENT_TRANSACTIONS_LIMIT = 10;
const PLAN_TYPES: PlanType[] = ["STANDARD", "FEATURED", "HANDS_ON"];

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

  async getRevenue(): Promise<RevenueSummary> {
    const paidJobs = await this.adminRepository.findPaidJobs();

    const monthKeys = buildRecentMonthKeys(REVENUE_MONTHS_WINDOW, new Date());
    const months = monthKeys.map(({ key, label }) => ({ key, label, standard: 0, featured: 0, handsOn: 0 }));
    const monthIndexByKey = new Map(months.map((month, index) => [month.key, index]));

    const mixByPlan = new Map<PlanType, { count: number; amount: number }>();

    for (const job of paidJobs) {
      const amount = PLAN_PRICES[job.planType];
      const paidOn = job.paidAt ?? job.createdAt;

      const monthIndex = monthIndexByKey.get(monthKeyOf(paidOn));
      if (monthIndex !== undefined) {
        const bucket = months[monthIndex];
        if (job.planType === "STANDARD") bucket.standard += amount;
        else if (job.planType === "FEATURED") bucket.featured += amount;
        else bucket.handsOn += amount;
      }

      const mix = mixByPlan.get(job.planType) ?? { count: 0, amount: 0 };
      mix.count += 1;
      mix.amount += amount;
      mixByPlan.set(job.planType, mix);
    }

    const mix: RevenuePlanMix[] = PLAN_TYPES.map((planType) => ({
      planType,
      label: PLAN_LABELS[planType],
      price: PLAN_PRICES[planType],
      count: mixByPlan.get(planType)?.count ?? 0,
      amount: mixByPlan.get(planType)?.amount ?? 0,
    }));

    const transactions = paidJobs.slice(0, RECENT_TRANSACTIONS_LIMIT).map((job) => ({
      jobId: job.id,
      jobTitle: job.title,
      companyName: job.employer.companyName,
      planType: job.planType,
      amount: PLAN_PRICES[job.planType],
      paidAt: (job.paidAt ?? job.createdAt).toISOString(),
    }));

    const allTime = paidJobs.reduce((sum, job) => sum + PLAN_PRICES[job.planType], 0);
    const currentMonthIndex = monthIndexByKey.get(monthKeyOf(new Date())) ?? months.length - 1;
    const currentMonth = months[currentMonthIndex];
    const thisMonth = currentMonth.standard + currentMonth.featured + currentMonth.handsOn;

    return { months, mix, transactions, totals: { allTime, thisMonth } };
  }
}
