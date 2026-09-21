FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV NEXT_PUBLIC_SUPPORT_API_URL=""

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SUPPORT_API_HOST=127.0.0.1
ENV SUPPORT_API_PORT=4317
ENV SUPPORT_WEB_ORIGIN=http://127.0.0.1:3000
ENV SUPPORT_DATA_DIR=/app/data

WORKDIR /app
RUN apt-get update \
  && apt-get install --no-install-recommends -y tini \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/data \
  && chown node:node /app/data

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/app ./app
COPY --from=build --chown=node:node /app/bin ./bin
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/next.config.ts /app/vite.config.ts ./

EXPOSE 3000
VOLUME ["/app/data"]
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "server/daemon.ts"]
