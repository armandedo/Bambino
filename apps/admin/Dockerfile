# Production image for the admin dashboard (served under /admin). Build from the repository root:
#   docker build -f apps/admin/Dockerfile -t bambino-admin \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.rw/graphql .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @bambino/admin --docker

FROM base AS builder
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @bambino/admin build

FROM node:22-alpine AS runner
RUN addgroup -S bambino && adduser -S bambino -G bambino
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
COPY --from=builder --chown=bambino:bambino /repo/apps/admin/.next/standalone ./
COPY --from=builder --chown=bambino:bambino /repo/apps/admin/.next/static ./apps/admin/.next/static
USER bambino
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/admin/ready > /dev/null || exit 1
CMD ["node", "apps/admin/server.js"]
