import { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";
import { experienceLevelSchema } from "@/common/dto/enums.schema";
import {
  employmentTypeSchema,
  noticePeriodSchema,
  timezoneOverlapSchema,
} from "./update-talent-profile.dto";

// Accepts a single value or repeated values for multi-select filtering — same
// coercion as list-jobs.dto.ts's toArray (no shared util between the two yet).
const toArray = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .preprocess(
      (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
      z.array(schema),
    )
    .optional();

export const listTalentSearchSchema = paginationQuerySchema.extend({
  q: z.string().max(200).optional(),
  skills: toArray(z.string().cuid()),
  level: toArray(experienceLevelSchema),
  country: toArray(z.string().max(100)),
  employmentTypes: toArray(employmentTypeSchema),
  timezoneOverlap: toArray(timezoneOverlapSchema),
  noticePeriod: toArray(noticePeriodSchema),
  // PB29 AC2: the employer's budget — candidates whose desired salary starts
  // above it are left out.
  maxSalary: z.coerce.number().int().positive().max(10_000_000).optional(),
});

export type ListTalentSearchDto = z.infer<typeof listTalentSearchSchema>;
