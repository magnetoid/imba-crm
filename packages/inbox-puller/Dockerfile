# syntax=docker/dockerfile:1.6
# ── crm-worker (was inbox-puller — now also serves /widget.js + /api/widget/*) ──
# Built from the repo root (workspace).
# docker build -f packages/inbox-puller/Dockerfile .

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# ── deps: include @imba/widget so the widget bundle can be built in
#   the same image that runs the worker (saves a deploy step).
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY packages/inbox-puller/package.json ./packages/inbox-puller/
COPY packages/widget/package.json       ./packages/widget/
# inbox-puller depends on @imba/shared/integrations/* — make sure pnpm
# sees it as a workspace package when filtering deps.
COPY packages/shared/package.json       ./packages/shared/
RUN pnpm install --filter "@imba/inbox-puller..." --filter "@imba/widget..." --no-frozen-lockfile

# ── build: compile the worker AND the widget; copy widget.js into the
#   image at /app/widget/widget.js where server.ts will read it.
FROM deps AS build
COPY packages/inbox-puller ./packages/inbox-puller
COPY packages/widget       ./packages/widget
COPY packages/shared       ./packages/shared
RUN pnpm --filter @imba/widget        build
RUN pnpm --filter @imba/inbox-puller  build

# ── runner: minimal alpine + node
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/inbox-puller/node_modules ./packages/inbox-puller/node_modules
COPY --from=build /app/packages/inbox-puller/dist ./packages/inbox-puller/dist
COPY --from=build /app/packages/inbox-puller/package.json ./packages/inbox-puller/package.json
COPY --from=build /app/packages/widget/dist /app/widget
ENV NODE_ENV=production
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","/app/packages/inbox-puller/dist/index.js"]
