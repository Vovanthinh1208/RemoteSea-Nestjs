import { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";

export const listJobsSchema = paginationQuerySchema.extend({
  status: z.enum(["DRAFT", "PENDING_REVIEW", "ACTIVE", "CLOSED", "REJECTED"]).default("PENDING_REVIEW"),
});

export type ListJobsDto = z.infer<typeof listJobsSchema>;
