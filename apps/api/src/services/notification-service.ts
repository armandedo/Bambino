import { type Database, type Executor, schema } from '@bambino/database';
import { and, desc, eq, isNull, lt, or, sql } from '@bambino/database/orm';
import type { NotificationType } from '@bambino/types';
import { z } from 'zod';
import { type ServiceContext, requireUser } from './context';
import { AppError } from './errors';
import { type Page, type PageRequest, decodeKeyset, encodeKeyset, pageSize, toPage } from './pagination';

export type NotificationRow = typeof schema.notifications.$inferSelect;

/**
 * In-app notifications are written in the same transaction as the event that causes
 * them. Email and push delivery per type is P1; the rows here are the source for both.
 */
export class NotificationService {
  constructor(private readonly db: Database) {}

  async notify(
    db: Executor,
    userId: string,
    type: NotificationType,
    params: Record<string, string | number> = {},
  ): Promise<void> {
    await db.insert(schema.notifications).values({
      userId,
      channel: 'IN_APP',
      type,
      params,
      status: 'SENT',
      sentAt: new Date(),
    });
  }

  async listOwn(
    context: ServiceContext,
    request: PageRequest,
  ): Promise<Page<NotificationRow> & { unreadCount: number }> {
    const actor = requireUser(context);
    const size = pageSize(request, 20);
    const cursor = decodeKeyset(request.after);
    const own = and(
      eq(schema.notifications.userId, actor.userId),
      eq(schema.notifications.channel, 'IN_APP'),
    );
    const rows = await this.db
      .select()
      .from(schema.notifications)
      .where(
        and(
          own,
          cursor
            ? or(
                lt(schema.notifications.createdAt, cursor.at),
                and(eq(schema.notifications.createdAt, cursor.at), lt(schema.notifications.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
      .limit(size + 1);
    const [unread] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(and(own, isNull(schema.notifications.readAt)));
    return {
      ...toPage(rows, size, (row) => encodeKeyset(row.createdAt, row.id)),
      unreadCount: unread?.n ?? 0,
    };
  }

  async markRead(context: ServiceContext, id: string): Promise<NotificationRow> {
    const actor = requireUser(context);
    if (!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND', 'Notification not found.');
    const [row] = await this.db
      .update(schema.notifications)
      .set({ readAt: sql`coalesce(${schema.notifications.readAt}, now())` })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, actor.userId)))
      .returning();
    if (!row) throw new AppError('NOT_FOUND', 'Notification not found.');
    return row;
  }

  async markAllRead(context: ServiceContext): Promise<number> {
    const actor = requireUser(context);
    const rows = await this.db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.userId, actor.userId), isNull(schema.notifications.readAt)))
      .returning({ id: schema.notifications.id });
    return rows.length;
  }
}
