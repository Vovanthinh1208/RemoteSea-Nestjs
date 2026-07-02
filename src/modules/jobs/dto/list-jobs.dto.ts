import { z } from "zod";

export const listJobsSchema = z.object({
  q: z.string().optional(),
  type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"]).optional(),
  level: z.enum(["ENTRY", "MID", "SENIOR", "LEAD", "EXECUTIVE"]).optional(),
  country: z.string().optional(),
  category: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export type ListJobsDto = z.infer<typeof listJobsSchema>;
