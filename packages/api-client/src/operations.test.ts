import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DocumentNode, Kind, buildSchema, parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';
import type { TypedOperation } from './client';
import * as operations from './index';

const schemaDirectory = fileURLToPath(new URL('../../../apps/api/src/graphql/schema', import.meta.url));
const schema = buildSchema(
  readdirSync(schemaDirectory)
    .filter((file) => file.endsWith('.graphql'))
    .sort()
    .map((file) => readFileSync(join(schemaDirectory, file), 'utf8'))
    .join('\n'),
);

function isOperation(value: unknown): value is TypedOperation<unknown, unknown> {
  return typeof value === 'object' && value !== null && 'document' in value && 'name' in value;
}

const all: [string, TypedOperation<unknown, unknown>][] = [];
for (const [name, value] of Object.entries(operations) as [string, unknown][]) {
  if (isOperation(value)) all.push([name, value]);
}

describe('client operations match the API contract', () => {
  it('exports operations', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it.each(all)('%s is valid against the schema and named consistently', (exportName, op) => {
    const document: DocumentNode = parse(op.document);
    expect(validate(schema, document).map((error) => error.message)).toEqual([]);
    const definitions = document.definitions.filter((d) => d.kind === Kind.OPERATION_DEFINITION);
    expect(definitions).toHaveLength(1);
    const definition = definitions[0];
    expect(definition?.name?.value).toBe(op.name);
    const suffix =
      definition?.kind === Kind.OPERATION_DEFINITION && definition.operation === 'mutation'
        ? 'Mutation'
        : 'Query';
    expect(exportName).toBe(`${op.name}${suffix}`);
  });
});
