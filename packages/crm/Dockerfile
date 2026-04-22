# syntax=docker/dockerfile:1.6
# ── CRM (crm.imbaproduction.com) ─────────────────────────────
# Built from the repo root so pnpm workspace can resolve @imba/shared.
# docker build -f packages/crm/Dockerfile .

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/crm/package.json ./packages/crm/
RUN pnpm install --filter ./packages/crm... --frozen-lockfile=false

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
RUN rm /etc/nginx/conf.d/default.conf
COPY packages/crm/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/crm/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
