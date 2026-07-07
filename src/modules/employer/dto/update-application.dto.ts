import { z } from "zod";
import { applicationStatusSchema } from "@/common/dto/enums.schema";

export const updateApplicationSchema = z.object({
  status: applicationStatusSchema,
  notes: z.string().max(2000).optional(),
});

export type UpdateApplicationDto = z.infer<typeof updateApplicationSchema>;
