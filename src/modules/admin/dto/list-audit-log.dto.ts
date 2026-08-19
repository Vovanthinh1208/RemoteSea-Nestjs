import { z } from "zod";
import { paginationQuerySchema } from "@/common/dto/pagination-query.schema";
import { adminAuditTargetTypeSchema } from "@/common/dto/enums.schema";

export const listAuditLogSchema = paginationQuerySchema.extend({
  targetType: adminAuditTargetTypeSchema.optional(),
  // "History for this job/employer/report" view — meaningful only alongside
  // targetType (see AdminService.listAuditLog), since ids aren't unique
  // across target types.
  targetId: z.string().optional(),
});

export type ListAuditLogDto = z.infer<typeof listAuditLogSchema>;
