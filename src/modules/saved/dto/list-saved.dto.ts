import type { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";

export const listSavedSchema = paginationQuerySchema;

export type ListSavedDto = z.infer<typeof listSavedSchema>;
