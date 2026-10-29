import { z } from "zod";
import {
  CANCEL_REASON_MAX_LENGTH,
  CANCEL_REASON_MIN_LENGTH,
} from "../constants";

// PB62 BR1: a cancellation always carries a reason for the talent.
export const cancelInterviewSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(CANCEL_REASON_MIN_LENGTH)
    .max(CANCEL_REASON_MAX_LENGTH),
});

export type CancelInterviewDto = z.infer<typeof cancelInterviewSchema>;
