# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --strict-ssl=true
COPY . .
RUN npm run build && mkdir -p /release/scripts \
    && cp -r dist server shared /release/ \
    && cp scripts/database.mjs scripts/start.mjs scripts/master-handoff.mjs /release/scripts/ \
    && chmod -R u=rwX,go=rX /release

FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS runtime
ENV NODE_ENV=production DEMO_MODE=false HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --chown=root:root --chmod=0644 package.json package-lock.json ./
RUN npm ci --omit=dev --strict-ssl=true && mkdir -p data && chown node:node data
# Railway initially starts the launcher as root. The app must never be able to
# replace that launcher or its imports on a writable container filesystem.
COPY --from=build --chown=root:root /release/ ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/start.mjs"]
