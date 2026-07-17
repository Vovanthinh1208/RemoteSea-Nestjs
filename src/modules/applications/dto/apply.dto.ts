import { z } from "zod";
import { httpUrlSchema } from "@/common/validation/http-url.schema";

export const applySchema = z.object({
  jobId: z.string().cuid(),
  coverLetter: z.string().max(5000).optional(),
  resumeUrl: httpUrlSchema.optional(),
});

export type ApplyDto = z.infer<typeof applySchema>;
