FROM node:24-alpine

RUN npm install --global pnpm@11.7.0
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/game-spec/package.json packages/game-spec/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json
COPY packages/llm/package.json packages/llm/package.json

COPY apps/web apps/web
COPY packages/shared packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @boardforge/web build
RUN cp -R apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

EXPOSE 3000
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 CMD wget -qO- http://127.0.0.1:3000/ || exit 1
CMD ["node", "apps/web/.next/standalone/apps/web/server.js"]
