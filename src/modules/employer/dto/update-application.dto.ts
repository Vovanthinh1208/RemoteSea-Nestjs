import { z } from "zod";

export const updateApplicationSchema = z.object({
  status: z.enum(["PENDING", "REVIEWING", "SHORTLISTED", "INTERVIEW", "OFFERED", "REJECTED", "WITHDRAWN"]),
  notes: z.string().max(2000).optional(),
});

export type UpdateApplicationDto = z.infer<typeof updateApplicationSchema>;
