# Sotos OS — imagen de producción
# © 2026 Sebastian Sotomontes

# 1) compilar el escritorio
FROM node:24-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
ARG VITE_PX_ORIGIN
ENV VITE_PX_ORIGIN=${VITE_PX_ORIGIN}
RUN npm run build

# 2) servidor (sin dependencias de npm: solo Node)
FROM node:24-alpine
ENV NODE_ENV=production SOTOS_DATA=/data SOTOS_WEB=/app/web/dist PORT=8787
WORKDIR /app
COPY server/ ./server/
COPY web/src/os/tree-ops.js ./web/src/os/tree-ops.js
COPY --from=web /app/web/dist ./web/dist
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "server/index.mjs"]
