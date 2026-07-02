import { z } from "zod";

export const reviewJobSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(2000).optional(),
});

export type ReviewJobDto = z.infer<typeof reviewJobSchema>;
