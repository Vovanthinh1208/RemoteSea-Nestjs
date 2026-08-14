import { applyDecorators } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { InternalServerErrorApiResponse } from "@/core/swagger/common.responses";
import {
  SalaryBenchmarkByCountryDto,
  SalaryBenchmarkBySeniorityDto,
  SalaryBenchmarkDto,
} from "./salary.dto";
import {
  ListBenchmarksByCountryResponseExample,
  ListBenchmarksBySeniorityResponseExample,
  ListBenchmarksResponseExample,
} from "./salary.examples";

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

export const ApiListBenchmarksBySeniority = () =>
  applyDecorators(
    ApiOperation({
      summary: "List salary benchmarks by category and seniority",
      description:
        "Same aggregate as GET /salary/benchmarks, further split by Job.level. " +
        "(role, level) pairs with no matching jobs are omitted. Sorted by sample count, descending. " +
        "No authentication required.",
    }),
    ApiOkResponse({
      description:
        "Salary benchmarks, one entry per (role, level) pair with at least one matching active job",
      type: [SalaryBenchmarkBySeniorityDto],
      schema: { example: ListBenchmarksBySeniorityResponseExample },
    }),
    InternalServerErrorApiResponse,
  );

export const ApiListBenchmarksByCountry = () =>
  applyDecorators(
    ApiOperation({
      summary: "List salary benchmarks by employer HQ country",
      description:
        "Aggregates average min/max/mid monthly salary and sample count per employer.hqCountry, computed " +
        "from active jobs that have a salaryMin set. Countries with no matching jobs are omitted. Sorted by " +
        "sample count, descending. No authentication required.",
    }),
    ApiOkResponse({
      description:
        "Salary benchmarks, one entry per hqCountry with at least one matching active job",
      type: [SalaryBenchmarkByCountryDto],
      schema: { example: ListBenchmarksByCountryResponseExample },
    }),
    InternalServerErrorApiResponse,
  );
