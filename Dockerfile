FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV NODE_ENV=development
ENV NODE_OPTIONS=--disable-warning=ExperimentalWarning

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--disable-warning=ExperimentalWarning

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY scripts ./scripts

RUN mkdir -p /app/data && chown -R node:node /app
USER node

VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "scripts/healthcheck.mjs"]

CMD ["node", "dist/index.js"]
