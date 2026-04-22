FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY packages/model-router/package.json ./packages/model-router/
COPY packages/frontend/package.json ./packages/frontend/
RUN pnpm install

# ── Build ────────────────────────────────────────────────────
FROM deps AS build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY packages/model-router/ ./packages/model-router/
COPY packages/frontend/ ./packages/frontend/
RUN pnpm --filter @agencycrm/model-router build \
 && pnpm --filter imba-production-web build

# ── Production-only node_modules for the router ──────────────
# A fresh install with prod-only deps keeps the runtime image small.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY packages/model-router/package.json ./packages/model-router/
COPY packages/frontend/package.json ./packages/frontend/
RUN pnpm install --prod --filter @agencycrm/model-router...

# ── Runtime: nginx serving the SPA + node running the router ─
FROM nginx:alpine AS production
# Alpine ships with a recent BusyBox; we need Node + curl for healthchecks.
RUN apk add --no-cache nodejs curl

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/model-router/node_modules ./packages/model-router/node_modules
COPY --from=build /app/packages/model-router/dist ./packages/model-router/dist
COPY --from=build /app/packages/model-router/package.json ./packages/model-router/package.json
COPY package.json pnpm-workspace.yaml* ./

# SPA static files served by nginx.
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html

# Nginx config + entry point.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Drop default root-user warnings & log to stdout/stderr (nginx:alpine already does this).
ENV NODE_ENV=production

EXPOSE 80 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1/health && curl -fsS http://127.0.0.1:3000/health || exit 1

CMD ["/start.sh"]
