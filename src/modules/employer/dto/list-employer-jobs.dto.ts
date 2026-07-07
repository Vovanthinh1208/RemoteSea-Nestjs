import { z } from "zod";
import { jobStatusSchema } from "@/common/dto/enums.schema";

export const listEmployerJobsSchema = z.object({
  status: jobStatusSchema.optional(),
});

export type ListEmployerJobsDto = z.infer<typeof listEmployerJobsSchema>;
