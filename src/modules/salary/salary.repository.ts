import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";

export type CategoryWithActiveJobSalaries = {
  name: string;
  jobs: Array<{ job: { salaryMin: number | null; salaryMax: number | null } }>;
};

@Injectable()
export class SalaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCategoriesWithActiveJobSalaries(): Promise<CategoryWithActiveJobSalaries[]> {
    return this.prisma.category.findMany({
      select: {
        name: true,
        jobs: {
          where: { job: { status: "ACTIVE", salaryMin: { not: null } } },
          select: { job: { select: { salaryMin: true, salaryMax: true } } },
        },
      },
    });
  }
}
