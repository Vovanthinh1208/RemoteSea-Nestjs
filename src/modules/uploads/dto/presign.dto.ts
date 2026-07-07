import { z } from "zod";

export const presignSchema = z.object({
  type: z.enum(["avatar", "logo", "resume"]),
  filename: z.string().min(1).max(200),
  contentType: z.string(),
  fileSize: z.coerce.number().int().positive(),
});

export type PresignDto = z.infer<typeof presignSchema>;
