FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY packages/model-router/package.json ./packages/model-router/
RUN pnpm install --frozen-lockfile || pnpm install

# Build
FROM deps AS build
COPY packages/model-router/ ./packages/model-router/
RUN cd packages/model-router && pnpm build

# Production
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/model-router/dist ./packages/model-router/dist
COPY --from=build /app/packages/model-router/package.json ./packages/model-router/package.json
COPY package.json ./

EXPOSE 3000
CMD ["node", "packages/model-router/dist/index.js"]
