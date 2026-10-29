FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace frontend --include-workspace-root --no-audit --no-fund
COPY frontend frontend
ENV VITE_API_URL=/api/v1
RUN npm run build --workspace frontend
FROM nginx:1.28.3-alpine AS runner
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="EventGrid frontend" org.opencontainers.image.revision=$VCS_REF
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=20s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
