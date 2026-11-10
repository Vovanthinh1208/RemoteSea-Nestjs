import { z } from "zod";
import { USER_ROLE_VALUES } from "@/common/constants/enum-values.constants";

export const updateUserSchema = z
  .object({
    action: z.enum(["ban", "unban", "change-role"]),
    role: z.enum(USER_ROLE_VALUES).optional(),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((data) => data.action !== "change-role" || !!data.role, {
    message: "role is required for the change-role action",
    path: ["role"],
  })
  .refine((v) => v.action !== "ban" || !!v.reason, {
    path: ["reason"],
    message: "Ban reason is required",
  });

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
