import { Controller, Get } from "@nestjs/common";
import { SalaryService } from "./salary.service";
import { ApiListBenchmarks, ApiSalaryTag } from "./docs/salary.swagger";
import type { SalaryBenchmark } from "./interfaces";

@ApiSalaryTag()
@Controller("salary")
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  @ApiListBenchmarks()
  @Get("benchmarks")
  list(): Promise<SalaryBenchmark[]> {
    return this.salaryService.listBenchmarks();
  }
}
