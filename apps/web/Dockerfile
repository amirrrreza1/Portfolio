# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24.13.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
WORKDIR /workspace
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json prettier.config.mjs tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
ARG PUBLIC_SITE_URL=https://example.invalid
ARG API_INTERNAL_ORIGIN=http://api:4000
ENV PUBLIC_SITE_URL=${PUBLIC_SITE_URL}
ENV API_INTERNAL_ORIGIN=${API_INTERNAL_ORIGIN}
RUN pnpm db:generate && pnpm build:packages && pnpm --filter @portfolio/web build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN groupadd --gid 10001 portfolio \
    && useradd --uid 10001 --gid portfolio --no-create-home --shell /usr/sbin/nologin portfolio
COPY --from=build --chown=10001:10001 /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=10001:10001 /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=10001:10001 /workspace/apps/web/public ./apps/web/public
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/robots.txt').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
