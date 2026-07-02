import { z } from "zod";

export const listEmployerJobsSchema = z.object({
  status: z.enum(["DRAFT", "PENDING_REVIEW", "ACTIVE", "CLOSED", "REJECTED"]).optional(),
});

export type ListEmployerJobsDto = z.infer<typeof listEmployerJobsSchema>;
