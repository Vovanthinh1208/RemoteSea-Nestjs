import { Controller, Get, Header } from "@nestjs/common";
import { SalaryService } from "./salary.service";
import {
  ApiListBenchmarks,
  ApiListBenchmarksByCountry,
  ApiListBenchmarksBySeniority,
  ApiSalaryTag,
} from "./docs/salary.swagger";
import type {
  SalaryBenchmark,
  SalaryBenchmarkByCountry,
  SalaryBenchmarkBySeniority,
} from "./interfaces";

const CACHE_CONTROL_HEADER =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=60";

@ApiSalaryTag()
@Controller("salary")
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  // Global aggregate with a 5-min server cache — same TTL for CDN edges.
  @ApiListBenchmarks()
  @Get("benchmarks")
  @Header("Cache-Control", CACHE_CONTROL_HEADER)
  list(): Promise<SalaryBenchmark[]> {
    return this.salaryService.listBenchmarks();
  }

  @ApiListBenchmarksBySeniority()
  @Get("benchmarks/by-seniority")
  @Header("Cache-Control", CACHE_CONTROL_HEADER)
  listBySeniority(): Promise<SalaryBenchmarkBySeniority[]> {
    return this.salaryService.listBenchmarksBySeniority();
  }

  @ApiListBenchmarksByCountry()
  @Get("benchmarks/by-country")
  @Header("Cache-Control", CACHE_CONTROL_HEADER)
  listByCountry(): Promise<SalaryBenchmarkByCountry[]> {
    return this.salaryService.listBenchmarksByCountry();
  }
}
