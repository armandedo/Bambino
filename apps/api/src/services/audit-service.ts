import { type Executor, schema } from '@bambino/database';
import type { ServiceContext } from './context';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
}

/** Writes to the append-only audit log, inside the caller's transaction so the record and the change commit together. */
export async function recordAudit(db: Executor, context: ServiceContext, entry: AuditEntry): Promise<void> {
  await db.insert(schema.auditLogs).values({
    actorId: context.actor.kind === 'user' ? context.actor.userId : null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    previousValue: entry.previousValue ?? null,
    newValue: entry.newValue ?? null,
    ipAddress: context.meta.ipAddress,
    userAgent: context.meta.userAgent,
    requestId: context.meta.requestId,
  });
}
