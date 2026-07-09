import { applyDecorators } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { InternalServerErrorApiResponse } from "@/core/swagger/common.responses";
import { SalaryBenchmarkDto } from "./salary.dto";
import { ListBenchmarksResponseExample } from "./salary.examples";

export const ApiSalaryTag = () => applyDecorators(ApiTags("Salary"));

export const ApiListBenchmarks = () =>
  applyDecorators(
    ApiOperation({
      summary: "List salary benchmarks by category",
      description:
        "Aggregates average min/max/mid monthly salary and sample count per job category, computed from " +
        "active jobs that have a salaryMin set. Categories with no matching jobs are omitted from the result. " +
        "Sorted by sample count, descending. No authentication required.",
    }),
    ApiOkResponse({
      description:
        "Salary benchmarks, one entry per category with at least one matching active job",
      type: [SalaryBenchmarkDto],
      schema: { example: ListBenchmarksResponseExample },
    }),
    InternalServerErrorApiResponse,
  );
