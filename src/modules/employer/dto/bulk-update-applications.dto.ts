import { z } from "zod";
import { applicationStatusSchema } from "@/common/dto/enums.schema";
import { BULK_UPDATE_MAX_ITEMS } from "../constants";

export const bulkUpdateApplicationsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(BULK_UPDATE_MAX_ITEMS),
  status: applicationStatusSchema,
});

export type BulkUpdateApplicationsDto = z.infer<
  typeof bulkUpdateApplicationsSchema
>;
