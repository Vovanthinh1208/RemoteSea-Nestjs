import { Injectable, Logger } from "@nestjs/common";
import type {
  AdminAuditAction,
  AdminAuditTargetType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";

export type RecordAuditLogInput = {
  adminId: string;
  adminEmail: string;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  targetLabel: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

const auditLogSelect = {
  id: true,
  adminId: true,
  adminEmail: true,
  action: true,
  targetType: true,
  targetId: true,
  targetLabel: true,
  before: true,
  after: true,
  createdAt: true,
} satisfies Prisma.AdminAuditLogSelect;

export type AuditLogEntry = Prisma.AdminAuditLogGetPayload<{
  select: typeof auditLogSelect;
}>;

export type ListAuditLogFilter = {
  targetType?: AdminAuditTargetType;
  targetId?: string;
};

/** Global (see SharedServicesModule) — every module that performs an admin
 * moderation action calls this directly, the same way EmailService is used
 * without each caller importing a dedicated module for it. */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Awaited by callers (not runInBackground'd) — unlike an email, a failed
  // write here isn't a degraded-but-tolerable side effect, it's the entire
  // point of the feature, so the caller's response should reflect whether it
  // actually landed. Still never throws: a logging-table outage blocking an
  // otherwise-successful moderation action would be a worse failure mode
  // than an incomplete audit trail, so failures are swallowed-and-logged,
  // same policy runInBackground applies elsewhere.
  async record(input: RecordAuditLogInput): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({ data: input });
    } catch (error) {
      this.logger.error(
        `Failed to record audit log entry: ${input.action} on ${input.targetType} ${input.targetId} by ${input.adminId}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async list(
    filter: ListAuditLogFilter,
    skip: number,
    take: number,
  ): Promise<[AuditLogEntry[], number]> {
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(filter.targetType && { targetType: filter.targetType }),
      ...(filter.targetId && { targetId: filter.targetId }),
    };
    return Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: auditLogSelect,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
  }
}
