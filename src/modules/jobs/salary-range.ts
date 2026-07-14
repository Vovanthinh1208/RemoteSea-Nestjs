import { BadRequestApiException } from "@/common/exceptions/api.exception";

type NullableSalaryFields = {
  salaryMin: number | null;
  salaryMax: number | null;
};
type SalaryPatch = { salaryMin?: number; salaryMax?: number };

/**
 * Encapsulates the one salary business rule this domain has: max must be >= min.
 * Was previously duplicated in JobsService — create() checked the raw DTO
 * (always both fields), update() checked the *effective* post-patch values (either
 * field may be omitted) — same rule, same error message, two slightly different
 * implementations that could drift out of sync.
 */
export class SalaryRange {
  private constructor(
    public readonly min: number,
    public readonly max: number,
  ) {}

  /** Throws if max < min. Both fields are required (matches CreateJobDto). */
  static create(min: number, max: number): SalaryRange {
    if (max < min) {
      throw new BadRequestApiException(
        "salaryMax must be greater than or equal to salaryMin",
      );
    }
    return new SalaryRange(min, max);
  }

  /**
   * For a partial update: merges a patch onto the existing job's stored range and
   * validates the *effective* result. Returns null (nothing to validate) if either
   * side ends up unset — matches today's behavior of only checking the invariant
   * when both bounds are actually known.
   */
  static merge(
    existing: NullableSalaryFields,
    patch: SalaryPatch,
  ): SalaryRange | null {
    const min = patch.salaryMin ?? existing.salaryMin;
    const max = patch.salaryMax ?? existing.salaryMax;
    if (min == null || max == null) return null;
    return SalaryRange.create(min, max);
  }
}
