FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --omit=dev pg@8.16.3

COPY scripts ./scripts
COPY migrations ./migrations
COPY .output ./.output

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

LABEL org.opencontainers.image.title="Requestick" \
  org.opencontainers.image.description="Company-only FFL inside-sales request board"

CMD ["sh", "-c", "node scripts/migrate.mjs && node .output/server/index.mjs"]
