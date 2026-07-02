import { z } from "zod";

export const updateAlertSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateAlertDto = z.infer<typeof updateAlertSchema>;
