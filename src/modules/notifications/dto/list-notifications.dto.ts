import type { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";

export const listNotificationsSchema = paginationQuerySchema;

export type ListNotificationsDto = z.infer<typeof listNotificationsSchema>;
