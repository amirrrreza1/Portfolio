ARG MINIO_CLIENT_VERSION=RELEASE.2025-07-21T05-28-08Z
FROM minio/mc:${MINIO_CLIENT_VERSION} AS minio-client

FROM postgres:17.6-bookworm
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates gnupg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=minio-client /usr/bin/mc /usr/local/bin/mc
RUN groupadd --gid 10001 portfolio \
    && useradd --uid 10001 --gid portfolio --no-create-home --shell /usr/sbin/nologin portfolio \
    && mkdir -p /backups \
    && chown 10001:10001 /backups
COPY --chown=10001:10001 infrastructure/docker/scripts /opt/portfolio/bin
RUN chmod 0555 /opt/portfolio/bin/*.sh
USER 10001:10001
WORKDIR /backups
