import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type GraphQLSchema, buildSchema } from 'graphql';

const schemaDirectory = fileURLToPath(new URL('./schema', import.meta.url));

/** The full contract as one SDL document, assembled from the per-area files. */
export function loadTypeDefs(): string {
  return readdirSync(schemaDirectory)
    .filter((file) => file.endsWith('.graphql'))
    .sort()
    .map((file) => readFileSync(join(schemaDirectory, file), 'utf8'))
    .join('\n');
}

/** A schema without resolvers: used to validate the contract and, later, to generate types. */
export function loadSchema(): GraphQLSchema {
  return buildSchema(loadTypeDefs());
}
