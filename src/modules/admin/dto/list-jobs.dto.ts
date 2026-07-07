import type { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";
import { jobStatusSchema } from "@/common/dto/enums.schema";

export const listJobsSchema = paginationQuerySchema.extend({
  status: jobStatusSchema.default("PENDING_REVIEW"),
});

export type ListJobsDto = z.infer<typeof listJobsSchema>;
