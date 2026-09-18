import { z } from "zod";
import { applicationStatusSchema } from "@/common/dto/enums.schema";

// Same status filter as listJobApplicationsSchema, minus pagination — export
// always returns the full (capped) filtered result set, so page/limit don't
// apply here.
export const exportJobApplicationsSchema = z.object({
  status: applicationStatusSchema.optional(),
});

export type ExportJobApplicationsDto = z.infer<
  typeof exportJobApplicationsSchema
>;
