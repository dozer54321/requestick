FROM node:22-bookworm-slim

WORKDIR /app

ARG REQUESTICK_VERSION=dev
ENV REQUESTICK_VERSION=$REQUESTICK_VERSION

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --omit=dev pg@8.16.3 \
  && mkdir -p /usr/local/lib/docker/cli-plugins \
  && curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.5.1.tgz \
    | tar -xz -C /tmp \
  && mv /tmp/docker/docker /usr/local/bin/docker \
  && rm -rf /tmp/docker \
  && curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \
    https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-x86_64 \
  && chmod +x /usr/local/bin/docker /usr/local/lib/docker/cli-plugins/docker-compose

COPY scripts ./scripts
COPY migrations ./migrations
COPY VERSION ./VERSION
COPY .output ./.output
COPY deploy/vps/docker-compose.yml deploy/vps/docker-compose.host-caddy.yml deploy/vps/Caddyfile /app/host-pack/

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV REQUESTICK_COMPOSE_DIR=/host/requestick
ENV REQUESTICK_UPDATE_REPO=dozer54321/requestick

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

LABEL org.opencontainers.image.title="Requestick" \
  org.opencontainers.image.description="Company-only FFL inside-sales request board"

CMD ["sh", "-c", "node scripts/migrate.mjs && node .output/server/index.mjs"]
