import { z } from "zod";
import { applicationStatusSchema } from "@/common/dto/enums.schema";
import { BULK_UPDATE_MAX_ITEMS } from "../constants";

export const bulkUpdateApplicationsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(BULK_UPDATE_MAX_ITEMS),
  status: applicationStatusSchema,
  // One shared note applied to every row in the batch — same field, same
  // cap as the single-application update; there's no per-item note in a
  // bulk request.
  notes: z.string().max(2000).optional(),
});

export type BulkUpdateApplicationsDto = z.infer<
  typeof bulkUpdateApplicationsSchema
>;
