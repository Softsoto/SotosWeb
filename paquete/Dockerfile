# Sotos — imagen desde el paquete ya compilado (sin compilar nada: rápida en un NAS)
# Synology: Container Manager → Proyecto → Crear, carpeta con este paquete y docker-compose.nas.yml
# © 2026 Sebastian Sotomontes
FROM node:24-alpine
# ffmpeg: películas MKV con audio AC3/DTS y subtítulos
# docker-cli + compose: con /var/run/docker.sock montado, el asistente instala los servicios opcionales
# (Office, Diagramas, Cine, Fotos, navegador virtual) en el Docker del propio NAS
RUN apk add --no-cache ffmpeg tzdata su-exec docker-cli docker-cli-compose
ENV NODE_ENV=production SOTOS_DATA=/data PORT=8787 HOST=0.0.0.0 SOTOS_SUPERVISED=1
WORKDIR /app
COPY . .
RUN mkdir -p /data && chown -R node:node /app
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
# Arranca como root solo para preparar permisos y sigue como SOTOS_UID:SOTOS_GID (por defecto «node»).
#   SOTOS_UID=0      root: lee carpetas con ACL de Synology y usa el Docker del NAS (docker.sock es de root)
#   SOTOS_UID=1026   el uid de un usuario de DSM: los mismos permisos que ese usuario en las carpetas
# SOTOS_DATA_ANTES: carpeta con datos de una instalación anterior; se copian una sola vez si SOTOS_DATA está vacía.
CMD ["sh", "-c", "U=${SOTOS_UID:-node}; G=${SOTOS_GID:-$U}; D=${SOTOS_DATA:-/data}; mkdir -p \"$D\"; if [ -n \"$SOTOS_DATA_ANTES\" ] && [ -d \"$SOTOS_DATA_ANTES\" ] && [ -z \"$(ls -A \"$D\")\" ] && [ -n \"$(ls -A \"$SOTOS_DATA_ANTES\")\" ]; then echo '[sotos] copiando datos de la instalación anterior'; cp -a \"$SOTOS_DATA_ANTES\"/. \"$D\"/; fi; chown -R \"$U:$G\" \"$D\" 2>/dev/null; [ \"$U\" != node ] && chown -R \"$U:$G\" /app 2>/dev/null; exec su-exec \"$U:$G\" node --env-file-if-exists=\"$D/sotos.env\" server/index.mjs"]
