# syntax=docker/dockerfile:1.6
# ── inbox-puller (IMAP + POP3 poller) ────────────────────────
# Built from the repo root (workspace).
# docker build -f packages/inbox-puller/Dockerfile .

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY packages/inbox-puller/package.json ./packages/inbox-puller/
RUN pnpm install --filter "@imba/inbox-puller..." --no-frozen-lockfile

FROM deps AS build
COPY packages/inbox-puller ./packages/inbox-puller
RUN pnpm --filter @imba/inbox-puller build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/inbox-puller/node_modules ./packages/inbox-puller/node_modules
COPY --from=build /app/packages/inbox-puller/dist ./packages/inbox-puller/dist
COPY --from=build /app/packages/inbox-puller/package.json ./packages/inbox-puller/package.json
ENV NODE_ENV=production
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","/app/packages/inbox-puller/dist/index.js"]
