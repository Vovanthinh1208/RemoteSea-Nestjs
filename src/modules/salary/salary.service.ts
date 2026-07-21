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
      () => this.salaryRepository.findBenchmarks(),
    );
  }
}
