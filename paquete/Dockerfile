# Sotos — imagen desde el paquete ya compilado (sin compilar nada: rápida en un NAS)
# Synology: Container Manager → Proyecto → Crear, carpeta con este paquete y docker-compose.nas.yml
# © 2026 Sebastian Sotomontes
FROM node:24-alpine
# ffmpeg: películas MKV con audio AC3/DTS y subtítulos
RUN apk add --no-cache ffmpeg tzdata su-exec
ENV NODE_ENV=production SOTOS_DATA=/data PORT=8787 HOST=0.0.0.0 SOTOS_SUPERVISED=1
WORKDIR /app
COPY . .
RUN mkdir -p /data && chown -R node:node /app
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
# la configuración que escribe el asistente vive en /data (persiste al recrear el contenedor)
# arranca como root solo para dar permisos a /data (carpetas de NAS creadas por otro usuario) y sigue como «node»
CMD ["sh", "-c", "chown -R node:node /data 2>/dev/null; exec su-exec node node --env-file-if-exists=/data/sotos.env server/index.mjs"]
