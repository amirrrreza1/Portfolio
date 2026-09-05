# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24.13.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
WORKDIR /workspace
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json prettier.config.mjs tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm db:generate \
    && pnpm build:packages \
    && pnpm --filter @portfolio/api build \
    && pnpm --filter @portfolio/api --prod deploy /prod/api \
    && pnpm --filter @portfolio/migrate --prod deploy /prod/migrate \
    && mkdir -p /prod/migrate/prisma \
    && cp packages/database/prisma/schema.prisma /prod/migrate/prisma/schema.prisma \
    && cp -R packages/database/prisma/migrations /prod/migrate/prisma/migrations

FROM ${NODE_IMAGE} AS api-runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --gid 10001 portfolio \
    && useradd --uid 10001 --gid portfolio --no-create-home --shell /usr/sbin/nologin portfolio
COPY --from=build --chown=10001:10001 /prod/api ./
USER 10001:10001
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/v1/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]

FROM api-runtime AS worker
HEALTHCHECK NONE
CMD ["node", "dist/worker/main.js", "--mode=publication"]

FROM ${NODE_IMAGE} AS migrate
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 portfolio \
    && useradd --uid 10001 --gid portfolio --no-create-home --shell /usr/sbin/nologin portfolio
COPY --from=build --chown=10001:10001 /prod/migrate ./
USER 10001:10001
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]
