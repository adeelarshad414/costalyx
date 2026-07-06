FROM node:22.12.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY backend backend
RUN npm --workspace backend run build
RUN npm prune --omit=dev

FROM node:22.12.0-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV APP_ENV=production
ENV PORT=3000

RUN addgroup -S costalyx && adduser -S -G costalyx costalyx

COPY --from=build --chown=costalyx:costalyx /app/package.json /app/package-lock.json ./
COPY --from=build --chown=costalyx:costalyx /app/node_modules node_modules
COPY --from=build --chown=costalyx:costalyx /app/backend/package.json backend/package.json
COPY --from=build --chown=costalyx:costalyx /app/backend/dist backend/dist

USER costalyx
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1

CMD ["npm", "--workspace", "backend", "run", "start"]
