import { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";
import { USER_ROLE_VALUES } from "@/common/constants/enum-values.constants";

export const listUsersSchema = paginationQuerySchema.extend({
  role: z.enum(USER_ROLE_VALUES).optional(),
  banned: z.enum(["true", "false"]).optional(),
  // Case-insensitive substring match on email/name — see
  // AdminRepository.findUsers.
  q: z.string().trim().min(1).max(200).optional(),
});

export type ListUsersDto = z.infer<typeof listUsersSchema>;
