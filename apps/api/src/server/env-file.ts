import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Loads .env.local from the repository root in development; production uses real environment variables. */
export function loadLocalEnvFile(): void {
  if (process.env.NODE_ENV === 'production') return;
  const path = fileURLToPath(new URL('../../../../.env.local', import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
