import { Inject, Injectable } from "@nestjs/common";
import { CACHE_MANAGER, type Cache } from "@nestjs/cache-manager";
import { SalaryRepository } from "./salary.repository";
import type { SalaryBenchmark } from "./interfaces";
import { getOrSetCache } from "@/common/caching/cache.util";

// Takes no params — a single global aggregate, same flat-key reasoning as jobs:facets.
const BENCHMARKS_CACHE_KEY = "salary:benchmarks";
const BENCHMARKS_CACHE_TTL_MS = 300_000;

@Injectable()
export class SalaryService {
  constructor(
    private readonly salaryRepository: SalaryRepository,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  listBenchmarks(): Promise<SalaryBenchmark[]> {
    return getOrSetCache(
      this.cache,
      BENCHMARKS_CACHE_KEY,
      BENCHMARKS_CACHE_TTL_MS,
      () => this.computeBenchmarks(),
    );
  }

  private async computeBenchmarks(): Promise<SalaryBenchmark[]> {
    const categories =
      await this.salaryRepository.findCategoriesWithActiveJobSalaries();

    const benchmarks: SalaryBenchmark[] = [];

    for (const category of categories) {
      const rows = category.jobs
        .map((j) => j.job)
        .filter(
          (j): j is { salaryMin: number; salaryMax: number | null } =>
            j.salaryMin !== null,
        );
      if (rows.length === 0) continue;

      const avg = (values: number[]): number =>
        Math.round(values.reduce((a, b) => a + b, 0) / values.length);

      benchmarks.push({
        role: category.name,
        min: avg(rows.map((r) => r.salaryMin)),
        max: avg(rows.map((r) => r.salaryMax ?? r.salaryMin)),
        mid: avg(
          rows.map((r) =>
            Math.round((r.salaryMin + (r.salaryMax ?? r.salaryMin)) / 2),
          ),
        ),
        count: rows.length,
      });
    }

    return benchmarks.sort((a, b) => b.count - a.count);
  }
}
