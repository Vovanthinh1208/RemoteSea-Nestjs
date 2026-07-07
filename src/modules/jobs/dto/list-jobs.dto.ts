import { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";
import { jobTypeSchema, experienceLevelSchema } from "@/common/dto/enums.schema";

const timezoneKeyEnum = z.enum(["sea", "async", "SG", "AU", "US"]);

// Accepts a single value (`?type=FULL_TIME`, the original single-select contract)
// or repeated values (`?type=CONTRACT&type=FREELANCE`) for multi-select filtering —
// ported from remotesea/src/lib/job-search.ts's array-based Filters, ported to
// GET /jobs as an additive capability (single-value callers are unaffected).
const toArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(schema)).optional();

export const listJobsSchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  type: toArray(jobTypeSchema),
  level: toArray(experienceLevelSchema),
  country: z.string().optional(),
  category: toArray(z.string()),
  timezone: toArray(timezoneKeyEnum),
  salaryMin: z.coerce.number().int().positive().optional(),
  salaryMax: z.coerce.number().int().positive().optional(),
  sort: z.enum(["recent", "salary", "featured"]).optional(),
});

export type ListJobsDto = z.infer<typeof listJobsSchema>;
