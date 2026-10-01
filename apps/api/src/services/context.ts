import type { Permission } from '@bambino/types';
import { AppError } from './errors';

export interface RequestMeta {
  readonly requestId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export interface UserActor {
  readonly kind: 'user';
  readonly userId: string;
  readonly sessionId: string;
  readonly permissions: ReadonlySet<Permission>;
}

export type Actor = { readonly kind: 'anonymous' } | UserActor;

export const ANONYMOUS: Actor = { kind: 'anonymous' };

/** What every service method receives: who is asking, and about which request. */
export interface ServiceContext {
  readonly actor: Actor;
  readonly meta: RequestMeta;
}

export function requireUser(context: ServiceContext): UserActor {
  if (context.actor.kind !== 'user') throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
  return context.actor;
}

export function requirePermission(context: ServiceContext, permission: Permission): UserActor {
  const actor = requireUser(context);
  if (!actor.permissions.has(permission)) {
    throw new AppError('FORBIDDEN', 'You do not have permission to do this.', permission);
  }
  return actor;
}
