import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // jsdom and axe make worker start-up heavy. Vitest gives a worker a fixed 60 s to start, which a busy machine
    // running the API's database tests in parallel could exceed. Threads start faster than forks, and one file at a
    // time avoids starting two jsdom workers at once.
    pool: 'threads',
    fileParallelism: false,
  },
});
