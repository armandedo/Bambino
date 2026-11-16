// Bundles the API into one file for the Vercel function (api/index.js re-exports it). Workspace packages ship
// TypeScript source, so they are compiled into the bundle here instead of being resolved at run time.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/vercel.ts'],
  outfile: 'dist/vercel.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  logLevel: 'info',
  // Some dependencies are CommonJS and call require() for Node built-ins, which an ES module does not have.
  banner: {
    js: "import { createRequire as bundleCreateRequire } from 'node:module';\nconst require = bundleCreateRequire(import.meta.url);",
  },
  // Optional native add-ons of `pg`; the pure JavaScript driver is used.
  external: ['pg-native', 'pg-cloudflare'],
});
