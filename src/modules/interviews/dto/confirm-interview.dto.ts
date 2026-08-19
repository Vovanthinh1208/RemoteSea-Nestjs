import { z } from "zod";

export const confirmInterviewSchema = z.object({
  slot: z.string().datetime(),
});

export type ConfirmInterviewDto = z.infer<typeof confirmInterviewSchema>;
