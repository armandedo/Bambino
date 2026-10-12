import { loadEnv } from '../config/env';
import { PUBLIC_READ_PREFIXES, createS3Provider } from '../providers/storage-factory';
import { loadLocalEnvFile } from '../server/env-file';

/** Creates the storage bucket if needed and makes product images publicly readable. Safe to re-run. */
loadLocalEnvFile();
const env = loadEnv();
if (env.STORAGE_PROVIDER !== 's3') {
  process.stdout.write('STORAGE_PROVIDER is not s3; nothing to initialise.\n');
} else {
  const storage = createS3Provider(env);
  const result = await storage.ensureBucket(PUBLIC_READ_PREFIXES);
  if (env.STORAGE_PRIVATE_BUCKET) {
    const priv = await storage.ensureBucket([], env.STORAGE_PRIVATE_BUCKET);
    process.stdout.write(
      `Private bucket "${env.STORAGE_PRIVATE_BUCKET}" ${priv.created ? 'created' : 'already existed'}\n`,
    );
  }
  process.stdout.write(
    `Bucket "${env.STORAGE_BUCKET}" ${result.created ? 'created' : 'already existed'}; public read on: ${PUBLIC_READ_PREFIXES.join(', ')}\n`,
  );
}
