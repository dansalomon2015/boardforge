FROM node:24-alpine

RUN npm install --global pnpm@11.7.0
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/game-spec/package.json packages/game-spec/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json
COPY packages/llm/package.json packages/llm/package.json

COPY apps/server apps/server
COPY packages packages
RUN pnpm install --frozen-lockfile

EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["pnpm", "--filter", "@boardforge/server", "start"]
