import type { Prisma } from "@prisma/client";
import type { PrismaService } from "@/core/database/prisma.service";
import type { RecordAuditLogInput } from "@/common/services/audit-log.service";

/** Commit the state change and its audit record together. A rejected CAS has
 * no action to audit. Non-admin callers retain the original repository API. */
export function auditedMutation<T>(
  prisma: PrismaService,
  audit: RecordAuditLogInput | undefined,
  mutate: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!audit) return mutate(prisma);
  return prisma.$transaction(async (tx) => {
    const result = await mutate(tx);
    if (result !== null) await tx.adminAuditLog.create({ data: audit });
    return result;
  });
}
