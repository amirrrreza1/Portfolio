FROM debian:bookworm-slim
ARG MINIO_CLIENT_VERSION=RELEASE.2025-07-21T05-28-08Z
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates curl gnupg postgresql-client \
    && curl --fail --silent --show-error --location \
      "https://dl.min.io/client/mc/release/linux-amd64/archive/mc.${MINIO_CLIENT_VERSION}" \
      --output /usr/local/bin/mc \
    && chmod 0755 /usr/local/bin/mc \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --gid 10001 portfolio \
    && useradd --uid 10001 --gid portfolio --no-create-home --shell /usr/sbin/nologin portfolio
COPY --chown=10001:10001 infrastructure/docker/scripts /opt/portfolio/bin
RUN chmod 0555 /opt/portfolio/bin/*.sh
USER 10001:10001
WORKDIR /backups
