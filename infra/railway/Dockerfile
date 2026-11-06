FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate

# Только то, что нужно для сборки бота (workspace-пакет shared).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json .npmrc ./
COPY packages ./packages
COPY apps/bot ./apps/bot

RUN pnpm install --frozen-lockfile --filter @case-sim/bot... \
 && pnpm --filter @case-sim/bot build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# tsup встраивает @case-sim/shared; остальные runtime-зависимости внешние.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/bot/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
