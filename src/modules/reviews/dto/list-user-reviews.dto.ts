import { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";

export const listUserReviewsSchema = paginationQuerySchema.extend({
  // PB72 AC3: filter by star rating, or sort by posting date.
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});

export type ListUserReviewsDto = z.infer<typeof listUserReviewsSchema>;
