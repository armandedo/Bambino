import { GraphQLError } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import { DomainError } from '../domain/errors';
import { AppError } from '../services/errors';
import type { GraphQLContext } from './context';

/**
 * Turns every error leaving execution into a safe, coded GraphQL error:
 * - AppError: its code, reason and field errors.
 * - DomainError (an illegal state change): CONFLICT.
 * - GraphQL's own input errors (bad variables, coercion): kept, coded BAD_USER_INPUT.
 * - Anything else: logged in full, returned as INTERNAL with no detail.
 * Every error carries the request id so support can find the log line.
 */
export function formatError(error: GraphQLError, context: GraphQLContext): GraphQLError {
  const original = error.originalError;
  const base = { nodes: error.nodes, path: error.path };
  const requestId = context.meta.requestId;

  if (original instanceof AppError) {
    return new GraphQLError(original.message, {
      ...base,
      extensions: {
        code: original.code,
        requestId,
        ...(original.reason ? { reason: original.reason } : {}),
        ...(original.fieldErrors.length > 0 ? { fieldErrors: original.fieldErrors } : {}),
      },
    });
  }
  if (original instanceof DomainError) {
    return new GraphQLError('This action is not possible in the current state.', {
      ...base,
      extensions: { code: 'CONFLICT', reason: original.code, requestId },
    });
  }
  if (!original || original instanceof GraphQLError) {
    return new GraphQLError(error.message, { ...base, extensions: { code: 'BAD_USER_INPUT', requestId } });
  }

  context.logger.error('unhandled error during execution', { requestId, path: error.path, error: original });
  return new GraphQLError('Something went wrong. Please try again.', {
    ...base,
    extensions: { code: 'INTERNAL', requestId },
  });
}

export function useErrorFormatting(): Plugin<GraphQLContext> {
  return {
    onExecute({ args }) {
      const context = args.contextValue as GraphQLContext;
      return {
        onExecuteDone({ result, setResult }) {
          if (Symbol.asyncIterator in result) return;
          if (!result.errors?.length) return;
          setResult({ ...result, errors: result.errors.map((error) => formatError(error, context)) });
        },
      };
    },
  };
}
