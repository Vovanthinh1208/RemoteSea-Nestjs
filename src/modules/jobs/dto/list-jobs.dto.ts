import { z } from "zod";

const jobTypeEnum = z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"]);
const levelEnum = z.enum(["ENTRY", "MID", "SENIOR", "LEAD", "EXECUTIVE"]);
const timezoneKeyEnum = z.enum(["sea", "async", "SG", "AU", "US"]);

// Accepts a single value (`?type=FULL_TIME`, the original single-select contract)
// or repeated values (`?type=CONTRACT&type=FREELANCE`) for multi-select filtering —
// ported from remotesea/src/lib/job-search.ts's array-based Filters, ported to
// GET /jobs as an additive capability (single-value callers are unaffected).
const toArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(schema)).optional();

export const listJobsSchema = z.object({
  q: z.string().optional(),
  type: toArray(jobTypeEnum),
  level: toArray(levelEnum),
  country: z.string().optional(),
  category: toArray(z.string()),
  timezone: toArray(timezoneKeyEnum),
  salaryMin: z.coerce.number().int().positive().optional(),
  salaryMax: z.coerce.number().int().positive().optional(),
  sort: z.enum(["recent", "salary", "featured"]).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export type ListJobsDto = z.infer<typeof listJobsSchema>;
