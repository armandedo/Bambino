import type { Permission } from '@bambino/types';
import { type GraphQLField, type GraphQLFieldResolver, type GraphQLSchema, Kind } from 'graphql';
import { requirePermission, requireUser } from '../services/context';
import { AppError } from '../services/errors';
import type { GraphQLContext } from './context';

type RootField = GraphQLField<unknown, GraphQLContext>;

function requiredPermission(field: RootField): Permission | undefined {
  const directive = field.astNode?.directives?.find((candidate) => candidate.name.value === 'requires');
  const value = directive?.arguments?.find((argument) => argument.name.value === 'permission')?.value;
  return value?.kind === Kind.STRING ? (value.value as Permission) : undefined;
}

function isAuthenticated(field: RootField): boolean {
  return field.astNode?.directives?.some((directive) => directive.name.value === 'authenticated') ?? false;
}

/**
 * Enforces the contract's @authenticated and @requires directives on every root field
 * before its resolver runs. Services check again; this is the second, independent layer.
 * Operations whose resolvers do not exist yet answer NOT_IMPLEMENTED instead of null.
 * Returns the names of operations that are implemented.
 */
export function applyGuards(schema: GraphQLSchema): { implemented: string[]; notImplemented: string[] } {
  const implemented: string[] = [];
  const notImplemented: string[] = [];

  for (const rootType of [schema.getQueryType(), schema.getMutationType()]) {
    if (!rootType) continue;
    for (const field of Object.values(rootType.getFields()) as RootField[]) {
      const permission = requiredPermission(field);
      const authenticated = isAuthenticated(field);
      const resolver: GraphQLFieldResolver<unknown, GraphQLContext> | undefined = field.resolve;

      if (resolver) implemented.push(field.name);
      else notImplemented.push(field.name);

      const inner: GraphQLFieldResolver<unknown, GraphQLContext> =
        resolver ??
        (() => {
          throw new AppError('NOT_IMPLEMENTED', `${field.name} is not available yet.`, field.name);
        });

      field.resolve = (source, args, context, info) => {
        if (permission) requirePermission(context, permission);
        else if (authenticated) requireUser(context);
        return inner(source, args, context, info);
      };
    }
  }
  return { implemented: implemented.sort(), notImplemented: notImplemented.sort() };
}
