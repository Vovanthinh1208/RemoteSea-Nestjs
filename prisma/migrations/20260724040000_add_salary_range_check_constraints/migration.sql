-- SalaryRange.merge() (salary-range.ts) validates "max >= min" against an
-- in-memory read taken before the write — under two concurrent partial
-- PATCHes to the same row (e.g. one sets only salaryMin, a racing one sets
-- only salaryMax), each request's own view of the other field is stale, so
-- both writes can pass validation individually while the persisted result
-- violates the invariant. No amount of application-level re-validation on a
-- pre-write read closes that gap — only a constraint the database itself
-- enforces on every write, regardless of which code path or how many
-- requests raced to get there, actually guarantees it. NULLs (either bound
-- unset) are exempt, matching SalaryRange.merge()'s existing behavior of
-- only checking the invariant once both bounds are known.
ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_salary_range_check"
  CHECK ("salaryMin" IS NULL OR "salaryMax" IS NULL OR "salaryMax" >= "salaryMin");

ALTER TABLE "talent_profiles"
  ADD CONSTRAINT "talent_profiles_desired_salary_range_check"
  CHECK ("desiredSalaryMin" IS NULL OR "desiredSalaryMax" IS NULL OR "desiredSalaryMax" >= "desiredSalaryMin");
