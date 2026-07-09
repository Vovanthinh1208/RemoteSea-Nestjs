import { ApiProperty } from "@nestjs/swagger";

/**
 * Swagger-only response shape for the Salary module.
 *
 * The app validates requests with Zod via ZodValidationPipe, not
 * class-validator — this class exists purely so Swagger can render a typed
 * schema in /docs. It is never imported outside this docs/ folder.
 */
export class SalaryBenchmarkDto {
  @ApiProperty({
    example: "Engineering",
    description: "Category name the benchmark is aggregated over.",
  })
  role!: string;

  @ApiProperty({
    example: 1800,
    description:
      "Average of salaryMin across matching active jobs, rounded to the nearest integer.",
  })
  min!: number;

  @ApiProperty({
    example: 4200,
    description:
      "Average of salaryMax across matching active jobs, falling back to salaryMin for jobs with no max set.",
  })
  max!: number;

  @ApiProperty({
    example: 3000,
    description:
      "Average of each job's own (salaryMin + salaryMax) / 2 midpoint.",
  })
  mid!: number;

  @ApiProperty({
    example: 12,
    description:
      "Number of active jobs with a salaryMin set that contributed to this benchmark.",
  })
  count!: number;
}
