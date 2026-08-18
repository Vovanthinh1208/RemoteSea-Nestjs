import { z } from "zod";

export const sendInvitationSchema = z.object({
  jobId: z.string().cuid(),
  talentId: z.string().cuid(),
  message: z.string().max(2000).optional(),
});

export type SendInvitationDto = z.infer<typeof sendInvitationSchema>;
