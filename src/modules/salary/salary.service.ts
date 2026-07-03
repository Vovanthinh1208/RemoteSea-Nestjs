import { Injectable } from "@nestjs/common";
import { SalaryRepository } from "./salary.repository";
import type { SalaryBenchmark } from "./interfaces";

@Injectable()
export class SalaryService {
  constructor(private readonly salaryRepository: SalaryRepository) {}

  async listBenchmarks(): Promise<SalaryBenchmark[]> {
    const categories = await this.salaryRepository.findCategoriesWithActiveJobSalaries();

    const benchmarks: SalaryBenchmark[] = [];

    for (const category of categories) {
      const rows = category.jobs
        .map((j) => j.job)
        .filter((j): j is { salaryMin: number; salaryMax: number | null } => j.salaryMin !== null);
      if (rows.length === 0) continue;

      const avg = (values: number[]): number =>
        Math.round(values.reduce((a, b) => a + b, 0) / values.length);

      benchmarks.push({
        role: category.name,
        min: avg(rows.map((r) => r.salaryMin)),
        max: avg(rows.map((r) => r.salaryMax ?? r.salaryMin)),
        mid: avg(rows.map((r) => Math.round((r.salaryMin + (r.salaryMax ?? r.salaryMin)) / 2))),
        count: rows.length,
      });
    }

    return benchmarks.sort((a, b) => b.count - a.count);
  }
}
