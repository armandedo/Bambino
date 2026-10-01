import { type Database, schema } from '@bambino/database';
import { and, asc, desc, eq, inArray, lt, ne, or, sql } from '@bambino/database/orm';
import { z } from 'zod';
import { recordAudit } from './audit-service';
import { type ServiceContext, requirePermission } from './context';
import { AppError, parseInput } from './errors';

export interface RoleView {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

export interface StaffUserView {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  roles: RoleView[];
}

export type AuditLogRow = typeof schema.auditLogs.$inferSelect & { actorName: string | null };

export interface AuditLogFilter {
  entityType?: string | null;
  entityId?: string | null;
  actorId?: string | null;
}

const MAX_PAGE_SIZE = 100;

/** Staff roles and the audit trail. Every method checks its permission itself. */
export class AccessService {
  constructor(private readonly db: Database) {}

  async listRoles(context: ServiceContext): Promise<RoleView[]> {
    requirePermission(context, 'user_role:read');
    return this.loadRoles();
  }

  async listStaffUsers(context: ServiceContext): Promise<StaffUserView[]> {
    requirePermission(context, 'user_role:read');
    const staff = await this.db
      .selectDistinct({ userId: schema.userRoles.userId })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(ne(schema.roles.key, 'CUSTOMER'));
    return this.loadStaffUsers(staff.map((row) => row.userId));
  }

  async assignRole(context: ServiceContext, rawUserId: unknown, rawRoleKey: unknown): Promise<StaffUserView> {
    return this.changeRole(context, rawUserId, rawRoleKey, 'assign');
  }

  async revokeRole(context: ServiceContext, rawUserId: unknown, rawRoleKey: unknown): Promise<StaffUserView> {
    return this.changeRole(context, rawUserId, rawRoleKey, 'revoke');
  }

  async listAuditLogs(
    context: ServiceContext,
    filter: AuditLogFilter,
    page: { first?: number | null; after?: string | null },
  ): Promise<{ items: AuditLogRow[]; endCursor: string | null; hasNextPage: boolean }> {
    requirePermission(context, 'audit_log:read');
    const first = Math.min(Math.max(page.first ?? 25, 1), MAX_PAGE_SIZE);
    const cursor = page.after ? decodeCursor(page.after) : null;
    const conditions = [
      filter.entityType ? eq(schema.auditLogs.entityType, filter.entityType) : undefined,
      filter.entityId ? eq(schema.auditLogs.entityId, filter.entityId) : undefined,
      filter.actorId ? eq(schema.auditLogs.actorId, filter.actorId) : undefined,
      cursor
        ? or(
            lt(schema.auditLogs.createdAt, cursor.createdAt),
            and(eq(schema.auditLogs.createdAt, cursor.createdAt), lt(schema.auditLogs.id, cursor.id)),
          )
        : undefined,
    ];
    const rows = await this.db
      .select({
        log: schema.auditLogs,
        firstName: schema.customerProfiles.firstName,
        lastName: schema.customerProfiles.lastName,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.customerProfiles, eq(schema.customerProfiles.userId, schema.auditLogs.actorId))
      .where(and(...conditions))
      .orderBy(desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id))
      .limit(first + 1);
    const items = rows.slice(0, first).map(({ log, firstName, lastName }) => ({
      ...log,
      actorName: firstName === null ? null : `${firstName} ${lastName ?? ''}`.trim(),
    }));
    const last = items.at(-1);
    return {
      items,
      hasNextPage: rows.length > first,
      endCursor: last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  private async changeRole(
    context: ServiceContext,
    rawUserId: unknown,
    rawRoleKey: unknown,
    change: 'assign' | 'revoke',
  ): Promise<StaffUserView> {
    const actor = requirePermission(context, 'user_role:write');
    const userId = parseInput(z.uuid(), rawUserId);
    const roleKey = parseInput(z.string().min(1).max(60), rawRoleKey);
    if (userId === actor.userId) {
      throw new AppError('FORBIDDEN', 'You cannot change your own roles.', 'SELF_ROLE_CHANGE');
    }

    await this.db.transaction(async (tx) => {
      const [role] = await tx.select().from(schema.roles).where(eq(schema.roles.key, roleKey));
      if (!role) throw new AppError('NOT_FOUND', 'Role not found.');
      const [user] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      if (!user) throw new AppError('NOT_FOUND', 'User not found.');

      if (change === 'assign') {
        await tx
          .insert(schema.userRoles)
          .values({ userId, roleId: role.id, grantedBy: actor.userId })
          .onConflictDoNothing();
      } else {
        if (role.key === 'SUPER_ADMIN') {
          const [holders] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(schema.userRoles)
            .where(eq(schema.userRoles.roleId, role.id));
          if ((holders?.n ?? 0) <= 1) {
            throw new AppError('CONFLICT', 'At least one super admin must remain.', 'LAST_SUPER_ADMIN');
          }
        }
        await tx
          .delete(schema.userRoles)
          .where(and(eq(schema.userRoles.userId, userId), eq(schema.userRoles.roleId, role.id)));
      }
      await recordAudit(tx, context, {
        action: change === 'assign' ? 'user_role.assigned' : 'user_role.revoked',
        entityType: 'user',
        entityId: userId,
        newValue: { roleKey: role.key },
      });
    });

    const [view] = await this.loadStaffUsers([userId]);
    if (!view) throw new AppError('NOT_FOUND', 'User not found.');
    return view;
  }

  private async loadRoles(roleIds?: string[]): Promise<RoleView[]> {
    const roles = await this.db
      .select()
      .from(schema.roles)
      .where(roleIds ? inArray(schema.roles.id, roleIds) : undefined)
      .orderBy(asc(schema.roles.key));
    if (roles.length === 0) return [];
    const grants = await this.db
      .select({ roleId: schema.rolePermissions.roleId, key: schema.permissions.key })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
      .where(
        inArray(
          schema.rolePermissions.roleId,
          roles.map((role) => role.id),
        ),
      )
      .orderBy(asc(schema.permissions.key));
    return roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      isSystem: role.isSystem,
      permissions: grants.filter((grant) => grant.roleId === role.id).map((grant) => grant.key),
    }));
  }

  private async loadStaffUsers(userIds: string[]): Promise<StaffUserView[]> {
    if (userIds.length === 0) return [];
    const users = await this.db
      .select({ user: schema.users, profile: schema.customerProfiles })
      .from(schema.users)
      .innerJoin(schema.customerProfiles, eq(schema.customerProfiles.userId, schema.users.id))
      .where(inArray(schema.users.id, userIds))
      .orderBy(asc(schema.customerProfiles.firstName));
    const memberships = await this.db
      .select({ userId: schema.userRoles.userId, roleId: schema.userRoles.roleId })
      .from(schema.userRoles)
      .where(inArray(schema.userRoles.userId, userIds));
    const roles = await this.loadRoles([...new Set(memberships.map((membership) => membership.roleId))]);
    return users.map(({ user, profile }) => ({
      id: user.id,
      email: user.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      roles: roles.filter((role) =>
        memberships.some((membership) => membership.userId === user.id && membership.roleId === role.id),
      ),
    }));
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const [createdAt, id] = z
      .tuple([z.iso.datetime(), z.uuid()])
      .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    return { createdAt: new Date(createdAt), id };
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Invalid page cursor.', 'INVALID_CURSOR');
  }
}
