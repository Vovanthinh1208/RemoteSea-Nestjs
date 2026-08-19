import { z } from "zod";

export const updateMemberRoleSchema = z.object({
  role: z.enum(["OWNER", "RECRUITER", "HIRING_MANAGER", "INTERVIEWER"]),
});

export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleSchema>;
