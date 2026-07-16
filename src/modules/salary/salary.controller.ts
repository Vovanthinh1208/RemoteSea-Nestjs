import { Controller, Get, Header } from "@nestjs/common";
import { SalaryService } from "./salary.service";
import { ApiListBenchmarks, ApiSalaryTag } from "./docs/salary.swagger";
import type { SalaryBenchmark } from "./interfaces";

@ApiSalaryTag()
@Controller("salary")
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  // Global aggregate with a 5-min server cache — same TTL for CDN edges.
  @ApiListBenchmarks()
  @Get("benchmarks")
  @Header(
    "Cache-Control",
    "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
  )
  list(): Promise<SalaryBenchmark[]> {
    return this.salaryService.listBenchmarks();
  }
}
