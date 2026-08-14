import { z } from "zod";

export const respondInvitationSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
});

export type RespondInvitationDto = z.infer<typeof respondInvitationSchema>;
