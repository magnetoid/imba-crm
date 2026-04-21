FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY packages/model-router/package.json ./packages/model-router/
COPY packages/frontend/package.json ./packages/frontend/
RUN pnpm install --frozen-lockfile || pnpm install

# Build backend and frontend
FROM deps AS build
COPY packages/model-router/ ./packages/model-router/
COPY packages/frontend/ ./packages/frontend/
RUN pnpm --filter model-router build
RUN pnpm --filter imba-production-web build

# Production - we use a lightweight Node image for the backend
# and we'll use Nginx to serve the static frontend
FROM nginx:alpine AS production

# Install Node.js in the Nginx container to run the backend API alongside it
RUN apk add --update nodejs npm

WORKDIR /app

# Copy backend files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/model-router/dist ./packages/model-router/dist
COPY --from=build /app/packages/model-router/package.json ./packages/model-router/package.json
COPY package.json ./

# Copy frontend static files to Nginx web root
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Start script to run both Nginx and Node
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 80 3000
CMD ["/start.sh"]
