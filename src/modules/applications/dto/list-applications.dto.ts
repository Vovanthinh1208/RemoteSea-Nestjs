import type { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";

export const listApplicationsSchema = paginationQuerySchema;

export type ListApplicationsDto = z.infer<typeof listApplicationsSchema>;
