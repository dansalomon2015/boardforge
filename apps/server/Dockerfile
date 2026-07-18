FROM node:24-alpine AS base

RUN npm install --global pnpm@11.7.0
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/game-spec/package.json packages/game-spec/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json
COPY packages/llm/package.json packages/llm/package.json

FROM base AS dependencies
RUN pnpm install --frozen-lockfile

FROM base AS production-dependencies
RUN pnpm install --prod --frozen-lockfile

FROM dependencies AS source
COPY apps/server apps/server
COPY packages packages

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps ./apps
COPY --from=production-dependencies /app/packages ./packages
COPY --from=source /app/apps/server ./apps/server
COPY --from=source /app/packages ./packages

EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["apps/server/node_modules/.bin/tsx", "apps/server/src/index.ts"]
