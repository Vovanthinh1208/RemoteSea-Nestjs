import type { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";

export const listUserReviewsSchema = paginationQuerySchema;

export type ListUserReviewsDto = z.infer<typeof listUserReviewsSchema>;
