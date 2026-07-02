import { z } from "zod";

export const listJobApplicationsSchema = z.object({
  status: z
    .enum(["PENDING", "REVIEWING", "SHORTLISTED", "INTERVIEW", "OFFERED", "REJECTED", "WITHDRAWN"])
    .optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export type ListJobApplicationsDto = z.infer<typeof listJobApplicationsSchema>;
