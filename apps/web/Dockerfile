# Production image for the customer website. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t bambino-web \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.rw/graphql \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://example.rw .
# NEXT_PUBLIC_* values are compiled into the browser bundle, so they are build arguments. The build refuses mock
# payments and http URLs unless NEXT_PUBLIC_PREVIEW_BANNER=true (apps/web/lib/launch-env.ts).

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @bambino/web --docker

FROM base AS builder
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MOCK_PAYMENTS=false
ARG NEXT_PUBLIC_PREVIEW_BANNER=false
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_MOCK_PAYMENTS=$NEXT_PUBLIC_MOCK_PAYMENTS \
    NEXT_PUBLIC_PREVIEW_BANNER=$NEXT_PUBLIC_PREVIEW_BANNER \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @bambino/web build

# Next's standalone output: a minimal server with only the files it traced.
FROM node:22-alpine AS runner
RUN addgroup -S bambino && adduser -S bambino -G bambino
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=bambino:bambino /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=bambino:bambino /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=bambino:bambino /repo/apps/web/public ./apps/web/public
USER bambino
EXPOSE 3000
# /ready answers 200 only when the API (and so the database) is ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ready > /dev/null || exit 1
# Runtime-only settings (API_URL, STORAGE_PUBLIC_BASE_URL, SITE_INDEXING, SENTRY_DSN) come from the environment.
CMD ["node", "apps/web/server.js"]
