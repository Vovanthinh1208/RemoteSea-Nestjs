import { z } from "zod";

export const updateMemberRoleSchema = z.object({
  role: z.enum(["OWNER", "RECRUITER", "HIRING_MANAGER", "INTERVIEWER"]),
  // PB39 AC3.2: promoting someone to OWNER hands over the company, so the current
  // owner re-enters their own password. Ignored for every other role change.
  password: z.string().max(200).optional(),
});

export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleSchema>;
