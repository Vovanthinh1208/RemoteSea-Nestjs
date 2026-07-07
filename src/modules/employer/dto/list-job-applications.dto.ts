import type { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";
import { applicationStatusSchema } from "@/common/dto/enums.schema";

export const listJobApplicationsSchema = paginationQuerySchema.extend({
  status: applicationStatusSchema.optional(),
});

export type ListJobApplicationsDto = z.infer<typeof listJobApplicationsSchema>;
