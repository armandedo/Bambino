import { getMarket } from '@bambino/config';
import type { AuthResult } from '../services/auth-service';
import type { AddressRow, DataRequestRow, UserView } from '../services/account-service';
import type { AuditLogRow, RoleView, StaffUserView } from '../services/access-service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../server/cookies';
import type { GraphQLContext } from './context';
import { DateScalar, DateTimeScalar, MinorUnitsScalar } from './scalars';

/**
 * Resolvers stay thin: read arguments, call one service method, shape the result.
 * Operations not listed here answer NOT_IMPLEMENTED (see guards.ts) until their phase.
 */

type Args<T> = T;
interface UserParent {
  id: string;
  view?: UserView;
}

/** Web clients get tokens as httpOnly cookies and never see them in the body. */
function authPayload(context: GraphQLContext, result: AuthResult) {
  const now = Date.now();
  if (context.client === 'web') {
    context.cookies.set(
      ACCESS_COOKIE,
      result.accessToken,
      (result.accessTokenExpiresAt.getTime() - now) / 1000,
    );
    context.cookies.set(
      REFRESH_COOKIE,
      result.refreshToken,
      (result.refreshTokenExpiresAt.getTime() - now) / 1000,
    );
  }
  return {
    user: { id: result.userId } satisfies UserParent,
    accessToken: context.client === 'web' ? null : result.accessToken,
    accessTokenExpiresAt: result.accessTokenExpiresAt,
    refreshToken: context.client === 'web' ? null : result.refreshToken,
  };
}

/** The refresh token comes from the cookie for web clients and from the argument for mobile clients. */
function presentedRefreshToken(context: GraphQLContext, argument: string | null | undefined): string | null {
  if (context.client === 'web') return context.cookies.incoming.get(REFRESH_COOKIE) ?? null;
  return argument ?? null;
}

async function userView(parent: UserParent, context: GraphQLContext): Promise<UserView> {
  parent.view ??= await context.services.account.loadUserView(parent.id);
  return parent.view;
}

const viewField =
  <K extends keyof UserView>(key: K) =>
  async (parent: UserParent, _args: unknown, context: GraphQLContext) =>
    (await userView(parent, context))[key];

export const resolvers = {
  DateTime: DateTimeScalar,
  Date: DateScalar,
  MinorUnits: MinorUnitsScalar,

  Query: {
    market: (_: unknown, __: unknown, context: GraphQLContext) => getMarket(context.marketCode),
    me: (_: unknown, __: unknown, context: GraphQLContext): UserParent | null =>
      context.actor.kind === 'user' ? { id: context.actor.userId } : null,
    myDataRequests: (_: unknown, __: unknown, context: GraphQLContext) =>
      context.services.account.listDataRequests(context),

    adminRoles: (_: unknown, __: unknown, context: GraphQLContext) =>
      context.services.access.listRoles(context),
    adminStaffUsers: (_: unknown, __: unknown, context: GraphQLContext) =>
      context.services.access.listStaffUsers(context),
    adminAuditLogs: async (
      _: unknown,
      args: Args<{
        entityType?: string | null;
        entityId?: string | null;
        actorId?: string | null;
        page?: { first?: number | null; after?: string | null } | null;
      }>,
      context: GraphQLContext,
    ) => {
      const result = await context.services.access.listAuditLogs(context, args, args.page ?? {});
      return {
        items: result.items,
        pageInfo: { endCursor: result.endCursor, hasNextPage: result.hasNextPage },
      };
    },
  },

  Mutation: {
    register: async (_: unknown, args: Args<{ input: unknown }>, context: GraphQLContext) =>
      authPayload(context, await context.services.auth.register(context, args.input)),
    login: async (_: unknown, args: Args<{ input: unknown }>, context: GraphQLContext) =>
      authPayload(context, await context.services.auth.login(context, args.input)),
    refreshSession: async (
      _: unknown,
      args: Args<{ refreshToken?: string | null }>,
      context: GraphQLContext,
    ) =>
      authPayload(
        context,
        await context.services.auth.refresh(context, presentedRefreshToken(context, args.refreshToken)),
      ),
    logout: async (_: unknown, args: Args<{ refreshToken?: string | null }>, context: GraphQLContext) => {
      await context.services.auth.logout(context, presentedRefreshToken(context, args.refreshToken));
      if (context.client === 'web') {
        context.cookies.clear(ACCESS_COOKIE);
        context.cookies.clear(REFRESH_COOKIE);
      }
      return true;
    },
    requestPasswordReset: async (_: unknown, args: Args<{ email: string }>, context: GraphQLContext) => {
      await context.services.auth.requestPasswordReset(context, args.email);
      return true;
    },
    resetPassword: async (
      _: unknown,
      args: Args<{ token: string; newPassword: string }>,
      context: GraphQLContext,
    ) => {
      await context.services.auth.resetPassword(context, args.token, args.newPassword);
      return true;
    },
    changePassword: async (
      _: unknown,
      args: Args<{ currentPassword: string; newPassword: string }>,
      context: GraphQLContext,
    ) => {
      await context.services.auth.changePassword(context, args.currentPassword, args.newPassword);
      return true;
    },
    requestEmailVerification: async (_: unknown, __: unknown, context: GraphQLContext) => {
      await context.services.auth.requestEmailVerification(context);
      return true;
    },
    verifyEmail: async (_: unknown, args: Args<{ token: string }>, context: GraphQLContext) => {
      await context.services.auth.verifyEmail(context, args.token);
      return true;
    },
    updateProfile: async (
      _: unknown,
      args: Args<{ input: unknown }>,
      context: GraphQLContext,
    ): Promise<UserParent> => {
      const view = await context.services.account.updateProfile(context, args.input);
      return { id: view.id, view };
    },
    createAddress: (_: unknown, args: Args<{ input: unknown }>, context: GraphQLContext) =>
      context.services.account.createAddress(context, args.input),
    updateAddress: (_: unknown, args: Args<{ id: string; input: unknown }>, context: GraphQLContext) =>
      context.services.account.updateAddress(context, args.id, args.input),
    deleteAddress: async (_: unknown, args: Args<{ id: string }>, context: GraphQLContext) => {
      await context.services.account.deleteAddress(context, args.id);
      return true;
    },
    recordConsent: async (_: unknown, args: Args<{ input: unknown }>, context: GraphQLContext) => {
      await context.services.account.recordConsent(context, args.input);
      return true;
    },
    requestDataExport: (_: unknown, __: unknown, context: GraphQLContext) =>
      context.services.account.requestDataExport(context),
    requestAccountDeletion: (_: unknown, args: Args<{ currentPassword: string }>, context: GraphQLContext) =>
      context.services.account.requestAccountDeletion(context, args.currentPassword),

    adminAssignRole: (_: unknown, args: Args<{ userId: string; roleKey: string }>, context: GraphQLContext) =>
      context.services.access.assignRole(context, args.userId, args.roleKey),
    adminRevokeRole: (_: unknown, args: Args<{ userId: string; roleKey: string }>, context: GraphQLContext) =>
      context.services.access.revokeRole(context, args.userId, args.roleKey),
  },

  /** Only ever constructed for the signed-in user (or the user who just signed in). */
  User: {
    id: (parent: UserParent) => parent.id,
    email: viewField('email'),
    emailVerified: viewField('emailVerified'),
    phone: viewField('phone'),
    firstName: viewField('firstName'),
    lastName: viewField('lastName'),
    preferredLocale: viewField('preferredLocale'),
    roles: viewField('roles'),
    createdAt: viewField('createdAt'),
    permissions: (parent: UserParent, _: unknown, context: GraphQLContext) =>
      context.services.auth.loadPermissions(parent.id),
    addresses: (parent: UserParent, _: unknown, context: GraphQLContext): Promise<AddressRow[]> =>
      context.services.account.listAddressesOf(parent.id),
  },

  DataRequest: {
    completedAt: (parent: DataRequestRow) => parent.completedAt,
  },

  Role: {
    permissions: (parent: RoleView) => parent.permissions,
  },

  StaffUser: {
    roles: (parent: StaffUserView) => parent.roles,
  },

  AuditLogEntry: {
    previousValue: (parent: AuditLogRow) =>
      parent.previousValue == null ? null : JSON.stringify(parent.previousValue),
    newValue: (parent: AuditLogRow) => (parent.newValue == null ? null : JSON.stringify(parent.newValue)),
  },
};
