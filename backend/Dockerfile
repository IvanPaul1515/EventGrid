FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
FROM base AS builder
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace backend --include-workspace-root --no-audit --no-fund
COPY backend backend
COPY scripts/build-info.* scripts/
RUN cd backend && npx prisma generate --schema prisma/schema.prisma && npx tsc
FROM base AS runner
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
ARG BUILD_ENV=docker
LABEL org.opencontainers.image.title="EventGrid backend" org.opencontainers.image.revision=$VCS_REF
LABEL org.opencontainers.image.created=$BUILD_DATE com.eventgrid.environment=$BUILD_ENV
ENV NODE_ENV=production CONTAINER_MODE=true PORT=4000
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/backend/dist /app/backend/dist
COPY backend/package.json /app/backend/package.json
COPY backend/prisma /app/backend/prisma
COPY backend/scripts/docker-runtime.mjs /app/backend/scripts/docker-runtime.mjs
COPY scripts/build-info.mjs /app/scripts/build-info.mjs
RUN node /app/scripts/build-info.mjs /app/backend/build-info.json /app/backend/package.json
RUN mkdir -p /app/backend/uploads && chown -R node:node /app/backend/uploads
WORKDIR /app/backend
USER node
EXPOSE 4000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "scripts/docker-runtime.mjs"]
CMD ["serve"]
