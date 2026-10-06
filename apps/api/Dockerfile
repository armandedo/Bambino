# Production image for the API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t bambino-api .
# The API runs its TypeScript through tsx (as `pnpm start` does), so there is no compile step.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# 1. Only the workspace packages the API needs (turbo prune), so unrelated changes do not bust the cache.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @bambino/api --docker

# 2. Install production and runtime dependencies from the pruned lockfile.
FROM base AS installer
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .

# 3. Run as an unprivileged user.
FROM node:22-alpine AS runner
RUN corepack enable && addgroup -S bambino && adduser -S bambino -G bambino
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=installer --chown=bambino:bambino /repo .
USER bambino
WORKDIR /repo/apps/api
EXPOSE 4000
# Readiness includes the database; the orchestrator restarts the container when it fails repeatedly.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/ready > /dev/null || exit 1
# Migrations run as a separate one-off step on deploy (docs/09-operations.md), not on every start.
CMD ["pnpm", "start"]
