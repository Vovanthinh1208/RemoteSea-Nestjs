import { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";
import { applicationStatusSchema } from "@/common/dto/enums.schema";

export const listJobApplicationsSchema = paginationQuerySchema.extend({
  status: applicationStatusSchema.optional(),
  // PB57 AC4: search applicants by name (case-insensitive substring).
  q: z.string().trim().min(1).max(100).optional(),
});

export type ListJobApplicationsDto = z.infer<typeof listJobApplicationsSchema>;
