import { z } from "zod";
import { USER_ROLE_VALUES } from "@/common/constants/enum-values.constants";

export const updateUserSchema = z
  .object({
    action: z.enum(["ban", "unban", "change-role"]),
    role: z.enum(USER_ROLE_VALUES).optional(),
  })
  .refine((data) => data.action !== "change-role" || !!data.role, {
    message: "role is required for the change-role action",
    path: ["role"],
  });

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
