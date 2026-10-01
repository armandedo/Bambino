import {
  type FragmentDefinitionNode,
  GraphQLError,
  Kind,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from 'graphql';

export interface QueryLimits {
  /** Deepest allowed nesting of selections. */
  maxDepth: number;
  /** Total field selections in a document, counting fragment spreads at each use. */
  maxFields: number;
  /** Aliases are how one request asks for the same expensive field many times. */
  maxAliases: number;
}

export const DEFAULT_QUERY_LIMITS: QueryLimits = { maxDepth: 10, maxFields: 400, maxAliases: 20 };

/**
 * Rejects abusive documents before execution: too deep, too wide or too many aliases.
 * Introspection selections count like any other.
 */
export function queryLimitsRule(limits: QueryLimits): ValidationRule {
  return (context: ValidationContext) => {
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const definition of context.getDocument().definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition);
    }

    return {
      OperationDefinition(operation) {
        let fields = 0;
        let aliases = 0;
        let maxDepth = 0;

        const visit = (selectionSet: SelectionSetNode, depth: number, seen: ReadonlySet<string>) => {
          maxDepth = Math.max(maxDepth, depth);
          // Stop walking once a limit is exceeded; the error is reported below.
          if (depth > limits.maxDepth || fields > limits.maxFields) return;
          for (const selection of selectionSet.selections) {
            if (selection.kind === Kind.FIELD) {
              fields += 1;
              if (selection.alias) aliases += 1;
              if (selection.selectionSet) visit(selection.selectionSet, depth + 1, seen);
            } else if (selection.kind === Kind.INLINE_FRAGMENT) {
              visit(selection.selectionSet, depth, seen);
            } else {
              const name = selection.name.value;
              const fragment = fragments.get(name);
              // Cycles are reported by the standard NoFragmentCycles rule.
              if (fragment && !seen.has(name)) visit(fragment.selectionSet, depth, new Set([...seen, name]));
            }
          }
        };
        visit(operation.selectionSet, 1, new Set());

        if (maxDepth > limits.maxDepth) {
          context.reportError(
            new GraphQLError(`Query is nested too deeply (limit ${limits.maxDepth}).`, {
              nodes: [operation],
            }),
          );
        }
        if (fields > limits.maxFields) {
          context.reportError(
            new GraphQLError(`Query selects too many fields (limit ${limits.maxFields}).`, {
              nodes: [operation],
            }),
          );
        }
        if (aliases > limits.maxAliases) {
          context.reportError(
            new GraphQLError(`Query uses too many aliases (limit ${limits.maxAliases}).`, {
              nodes: [operation],
            }),
          );
        }
      },
    };
  };
}
