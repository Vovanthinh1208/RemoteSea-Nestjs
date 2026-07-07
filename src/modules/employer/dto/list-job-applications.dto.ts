import { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";

export const listJobApplicationsSchema = paginationQuerySchema.extend({
  status: z
    .enum(["PENDING", "REVIEWING", "SHORTLISTED", "INTERVIEW", "OFFERED", "REJECTED", "WITHDRAWN"])
    .optional(),
});

export type ListJobApplicationsDto = z.infer<typeof listJobApplicationsSchema>;
