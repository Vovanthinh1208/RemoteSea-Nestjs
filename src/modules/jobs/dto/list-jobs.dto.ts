import { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";
import {
  jobTypeSchema,
  experienceLevelSchema,
} from "@/common/dto/enums.schema";

const timezoneKeyEnum = z.enum(["sea", "async", "SG", "AU", "US"]);

// Accepts a single value (`?type=FULL_TIME`, the original single-select contract)
// or repeated values (`?type=CONTRACT&type=FREELANCE`) for multi-select filtering —
// ported from remotesea/src/lib/job-search.ts's array-based Filters, ported to
// GET /jobs as an additive capability (single-value callers are unaffected).
const toArray = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .preprocess(
      (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
      z.array(schema),
    )
    .optional();

export const listJobsSchema = paginationQuerySchema.extend({
  q: z.string().max(200).optional(),
  type: toArray(jobTypeSchema),
  level: toArray(experienceLevelSchema),
  // Array like every other multi-select filter here (was single-value only) —
  // `?country=Vietnam` still works unchanged via toArray's single-value
  // coercion; `?country=Vietnam&country=Singapore` is the new capability.
  country: toArray(z.string().max(100)),
  category: toArray(z.string().max(100)),
  timezone: toArray(timezoneKeyEnum),
  salaryMin: z.coerce.number().int().positive().optional(),
  salaryMax: z.coerce.number().int().positive().optional(),
  // "relevance" only has an effect combined with `q` (see job-search.util.ts's
  // buildSearchRankedIdsQuery) — it's also the implicit default whenever `q`
  // is present and `sort` is omitted, so this is here mainly so a caller can
  // ask for it explicitly and so the enum documents that the value exists.
  sort: z.enum(["recent", "salary", "featured", "relevance"]).optional(),
});

export type ListJobsDto = z.infer<typeof listJobsSchema>;
