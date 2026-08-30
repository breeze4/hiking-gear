FROM node:22.14.0-bookworm-slim@sha256:745403dc46b5ab4c998502b07a12cbf020cf2c30645427a68ec0718f02d647de AS build

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . ./
RUN pnpm build && pnpm prune --prod

FROM node:22.14.0-bookworm-slim@sha256:745403dc46b5ab4c998502b07a12cbf020cf2c30645427a68ec0718f02d647de

ARG VCS_REF
LABEL org.opencontainers.image.source="https://github.com/breeze4/hiking-gear"
LABEL org.opencontainers.image.revision="${VCS_REF}"

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/hiking-gear.db

WORKDIR /app
COPY --from=build --chown=1000:1000 /app/package.json ./
COPY --from=build --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=build --chown=1000:1000 /app/server ./server
COPY --from=build --chown=1000:1000 /app/src ./src
COPY --from=build --chown=1000:1000 /app/dist ./dist

USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then((r) => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/index.ts"]
