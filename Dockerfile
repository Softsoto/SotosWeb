# Sotos — imagen de producción compilada desde el código
#   docker build -t sotos .     (o docker compose up -d --build)
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
# ffmpeg: películas MKV con audio AC3/DTS y subtítulos · su-exec: dar permisos a /data y seguir como «node»
RUN apk add --no-cache ffmpeg tzdata su-exec
ENV NODE_ENV=production SOTOS_DATA=/data PORT=8787 HOST=0.0.0.0 SOTOS_SUPERVISED=1
WORKDIR /app
COPY VERSION README.md CHANGELOG.md LICENSE ./
COPY server/ ./server/
COPY sdk/ ./sdk/
COPY docs/capturas/ ./docs/capturas/
COPY web/src/os/tree-ops.js ./web/src/os/tree-ops.js
COPY --from=web /app/web/dist ./web/dist
RUN rm -rf server/data server/.env server/sotos.env && mkdir -p /data && chown -R node:node /app /data
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
# la configuración que escribe el asistente vive en /data (persiste al recrear el contenedor)
# el lanzador usa la versión más nueva: la de la imagen o la que instaló el botón «Actualizar» en /data/app
CMD ["sh", "-c", "chown -R node:node /data 2>/dev/null; exec su-exec node node --env-file-if-exists=/data/sotos.env server/lanzador.mjs"]
