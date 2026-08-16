import type { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";
import { jobReportStatusSchema } from "@/common/dto/enums.schema";

export const listJobReportsSchema = paginationQuerySchema.extend({
  status: jobReportStatusSchema.default("OPEN"),
});

export type ListJobReportsDto = z.infer<typeof listJobReportsSchema>;
