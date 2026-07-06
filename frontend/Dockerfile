FROM node:22.12.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY frontend frontend

ARG VITE_API_BASE_URL
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM
ENV VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID

RUN test -n "$VITE_API_BASE_URL"
RUN test -n "$VITE_KEYCLOAK_URL"
RUN test -n "$VITE_KEYCLOAK_REALM"
RUN test -n "$VITE_KEYCLOAK_CLIENT_ID"
RUN npm --workspace frontend run build

FROM node:22.12.0-alpine AS runtime

WORKDIR /srv/www
ENV NODE_ENV=production

RUN addgroup -S costalyx && adduser -S -G costalyx costalyx

COPY --from=build --chown=costalyx:costalyx /app/frontend/dist ./

USER costalyx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

CMD ["busybox", "httpd", "-f", "-p", "8080", "-h", "/srv/www"]
