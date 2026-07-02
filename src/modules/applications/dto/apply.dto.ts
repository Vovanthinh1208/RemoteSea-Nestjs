import { z } from "zod";

export const applySchema = z.object({
  jobId: z.string().cuid(),
  coverLetter: z.string().max(5000).optional(),
  resumeUrl: z.string().url().optional(),
});

export type ApplyDto = z.infer<typeof applySchema>;
