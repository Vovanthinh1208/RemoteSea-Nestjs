import { z } from "zod";
import { emailSchema } from "@/common/dto/email.schema";

// OWNER excluded on purpose — this app already caps a company at one OWNER
// seat implicitly (whoever created it); promoting someone to OWNER happens
// via updateMemberRole after they've joined, never via invite.
export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(["RECRUITER", "HIRING_MANAGER", "INTERVIEWER"]),
});

export type InviteMemberDto = z.infer<typeof inviteMemberSchema>;
