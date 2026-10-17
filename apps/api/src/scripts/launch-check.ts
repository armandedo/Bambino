import { LEGAL_DOCUMENT_VERSIONS } from '@bambino/config';
import { connectDatabase } from '@bambino/database/client';
import { loadEnv } from '../config/env';
import { findPlaceholderData } from '../domain/placeholder-data';
import { loadLocalEnvFile } from '../server/env-file';

/**
 * Run before pointing customers at an environment:
 *   NODE_ENV=production DATABASE_URL=... pnpm --filter @bambino/api launch:check
 *
 * Settings are validated by loadEnv (production refuses placeholders, mock payments, the console email provider
 * and plain-http origins). This adds two things settings cannot show:
 * - the database: any development seed row (labelled SEED) fails the check;
 * - the legal documents customers agree to when they register: a version still marked `draft` fails the check.
 */
loadLocalEnvFile();
const env = loadEnv();
const connection = connectDatabase(env.DATABASE_URL);

try {
  const findings = await findPlaceholderData(connection.db, 100);
  const drafts = Object.entries(LEGAL_DOCUMENT_VERSIONS).filter(([, version]) => /^draft/i.test(version));
  let failed = false;

  if (findings.length === 0) {
    process.stdout.write('Database: no development placeholder data.\n');
  } else {
    failed = true;
    process.stderr.write(
      `Database FAILED: ${findings.length} development placeholder row(s) found.\n` +
        findings.map((finding) => `  ${finding.table}: ${finding.value}`).join('\n') +
        '\nCustomers would see these. Use a clean production database, or remove the rows.\n',
    );
  }

  if (drafts.length === 0) {
    process.stdout.write('Legal documents: all published.\n');
  } else {
    failed = true;
    process.stderr.write(
      `Legal documents FAILED, still drafts: ${drafts.map(([type, version]) => `${type} (${version})`).join(', ')}.\n` +
        'Publish the texts and set their versions in packages/config/src/legal.ts.\n',
    );
  }

  if (failed) process.exitCode = 1;
  else process.stdout.write('Launch check passed.\n');
} finally {
  await connection.close();
}
