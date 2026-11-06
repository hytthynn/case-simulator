FROM node:22-alpine AS build
WORKDIR /app
# Node 25+ не поставляет Corepack, поэтому ставим pnpm явно и фиксируем версию.
RUN npm install -g pnpm@10.34.9

# Копируем ВСЕ package.json воркспейса, чтобы pnpm-lock.yaml оставался консистентным
# при `pnpm install --frozen-lockfile --filter`. Тяжёлые файлы отсекает .dockerignore.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json .npmrc ./
COPY packages ./packages
COPY apps ./apps

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
