import { z } from "zod";
import { jobReportReasonSchema } from "@/common/dto/enums.schema";

export const createJobReportSchema = z.object({
  reason: jobReportReasonSchema,
  details: z.string().max(2000).optional(),
});

export type CreateJobReportDto = z.infer<typeof createJobReportSchema>;
