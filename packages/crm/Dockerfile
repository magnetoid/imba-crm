# syntax=docker/dockerfile:1.6
# ── CRM (crm.imbaproduction.com) ─────────────────────────────
# Built from the repo root so pnpm workspace can resolve @imba/shared.
# docker build -f packages/crm/Dockerfile .

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/crm/package.json ./packages/crm/
# Filter to the CRM package and all its workspace dependencies (@imba/shared).
# Use the named-package form because the path form with trailing "..." is
# inconsistent across pnpm versions.
RUN pnpm install --filter "@imba/crm..." --no-frozen-lockfile

FROM deps AS build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_APP_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_APP_URL=$VITE_APP_URL

COPY packages/shared ./packages/shared
COPY packages/crm ./packages/crm
RUN pnpm --filter @imba/crm build

FROM nginx:1.27-alpine AS runner
# wget is missing from nginx:alpine; install it so the healthcheck
# (used by Coolify to flip status off "restarting:unknown") works.
RUN apk add --no-cache wget && rm /etc/nginx/conf.d/default.conf
COPY packages/crm/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/crm/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
