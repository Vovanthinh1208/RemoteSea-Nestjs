import { z } from "zod";
import { httpUrlSchema } from "@/common/validation/http-url.schema";
import {
  MAX_DURATION_MINUTES,
  MAX_PROPOSED_SLOTS,
  MIN_DURATION_MINUTES,
} from "../constants";

export const proposeInterviewSchema = z.object({
  durationMinutes: z
    .number()
    .int()
    .min(MIN_DURATION_MINUTES)
    .max(MAX_DURATION_MINUTES),
  proposedSlots: z.array(z.string().datetime()).min(1).max(MAX_PROPOSED_SLOTS),
  meetingUrl: httpUrlSchema.optional(),
  // Which company member actually runs this interview — optional (the
  // interview stays unassigned, visible only to OWNER/RECRUITER/
  // HIRING_MANAGER, until someone sets it). Validated server-side against
  // the application's own company in InterviewsService.propose — never
  // trust that this id is even a real company member, let alone the right
  // company's.
  interviewerId: z.string().cuid().optional(),
});

export type ProposeInterviewDto = z.infer<typeof proposeInterviewSchema>;
