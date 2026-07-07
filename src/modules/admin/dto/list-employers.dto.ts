import { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";

export const listEmployersSchema = paginationQuerySchema.extend({
  verified: z.enum(["true", "false"]).optional(),
});

export type ListEmployersDto = z.infer<typeof listEmployersSchema>;
