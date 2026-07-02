import { z } from "zod";

export const listJobsSchema = z.object({
  status: z.enum(["DRAFT", "PENDING_REVIEW", "ACTIVE", "CLOSED", "REJECTED"]).default("PENDING_REVIEW"),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export type ListJobsDto = z.infer<typeof listJobsSchema>;
