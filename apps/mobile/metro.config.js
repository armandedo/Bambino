// Metro for the Bambino monorepo.
//
// Expo watches the whole workspace root by default. That root also holds the web, admin and API builds
// (.open-next, .next, .wrangler), whose folders can be unreadable on Windows and made `expo start` crash with
// EACCES. The app only needs its own folder, the shared packages, and the root node_modules (pnpm's store).
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  projectRoot,
  path.join(workspaceRoot, 'packages'),
  path.join(workspaceRoot, 'node_modules'),
];

config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(workspaceRoot, 'node_modules'),
];

// Never crawl build output, wherever it is.
const ignored = /[\\/](\.open-next|\.next|\.wrangler|\.turbo|\.expo-export)[\\/].*/;
const existing = config.resolver.blockList;
config.resolver.blockList = existing ? [].concat(existing, ignored) : [ignored];

module.exports = config;
