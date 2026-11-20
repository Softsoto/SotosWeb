#!/usr/bin/env bash
# ============================================================
#  Sotos — instalador de un solo archivo para Linux, NAS y hosting/VPS
#  Revisa el equipo, descarga la última versión de Sotos (o usa el paquete que tenga al lado),
#  lo instala y lo deja corriendo; el asistente web termina la configuración.
#
#  Uso:  bash instalar-sotos.sh [instalar|actualizar|comprobar|desinstalar] [--carpeta DIR] [--datos DIR]
#                               [--puerto 8787] [--paquete sotos-x.y.z.tar.gz] [--servicio] [--si]
#  --servicio  lo instala como servicio de systemd (arranca solo; pide sudo)
#  --si        responde «sí» a todo (instalación desatendida)
#  © 2026 Sebastian Sotomontes · Licencia MIT
# ============================================================
set -euo pipefail
ACCION="instalar"; CARPETA="${HOME}/sotos"; DATOS="${HOME}/.local/share/sotos/datos"; PUERTO=8787; PAQUETE=""; SERVICIO=0; SI=0
REPO="Softsoto/SotosWeb"
while [[ $# -gt 0 ]]; do case "$1" in
  instalar|actualizar|comprobar|desinstalar) ACCION="$1";; --carpeta) CARPETA="$2"; shift;; --datos) DATOS="$2"; shift;; --puerto) PUERTO="$2"; shift;;
  --paquete) PAQUETE="$2"; shift;; --servicio) SERVICIO=1;; --si) SI=1;; *) echo "Opción desconocida: $1"; exit 2;; esac; shift; done
ENVF="$(dirname "$DATOS")/sotos.env"
c() { printf "\033[%sm%s\033[0m\n" "$1" "$2"; }
titulo() { echo; c "1" "  $1"; }; paso() { c "90" "  > $1"; }; ok() { c "32" "  + $1"; }; aviso() { c "33" "  ! $1"; }; falla() { c "31" "  x $1"; }
pregunta() { [[ $SI == 1 ]] && return 0; local r; read -r -p "  ? $1 [${2:-s}] " r || true; r="${r:-${2:-s}}"; [[ "${r,,}" == s* ]]; }
c "33" "   ____        _"; c "33" "  / ___|  ___ | |_ ___  ___"; c "33" "  \\___ \\ / _ \\| __/ _ \\/ __|   tu ordenador en la nube"; c "33" "   ___) | (_) | || (_) \\__ \\   (c) 2026 Sebastian Sotomontes"; c "33" "  |____/ \\___/ \\__\\___/|___/"

detener() { pkill -f "$CARPETA/server/index.mjs" 2>/dev/null || true; }
comprobar() {
  titulo "Comprobando este equipo"; local bien=0
  ok "$(uname -s) $(uname -m)"
  if [[ -f /etc/synoinfo.conf || -f /etc.defaults/synoinfo.conf ]]; then aviso "Esto parece un Synology: lo más cómodo es Container Manager con docker-compose.nas.yml (ver README)"; fi
  local n=0; command -v node >/dev/null && n="$(node -v | sed 's/^v//; s/\..*//')"
  if (( n >= 22 )); then ok "Node.js $(node -v)"; else
    aviso "Node.js 22 o superior no está instalado."
    if [[ $ACCION != comprobar ]] && command -v apt-get >/dev/null && pregunta "¿Instalarlo con NodeSource (pide sudo)?"; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs && ok "Node.js $(node -v) instalado" || { falla "No se pudo instalar Node.js"; bien=1; }
    else falla "Instala Node.js 22 o superior: https://nodejs.org (o usa Docker)"; bien=1; fi
  fi
  mkdir -p "$DATOS" 2>/dev/null && touch "$DATOS/.prueba" 2>/dev/null && rm -f "$DATOS/.prueba" && ok "Carpeta de datos: $DATOS" || { falla "No se puede escribir en $DATOS"; bien=1; }
  local libre; libre=$(df -Pk "$DATOS" 2>/dev/null | awk 'NR==2 {printf "%.1f", $4/1048576}'); ok "${libre:-?} GB libres"
  if command -v ss >/dev/null && ss -ltn | grep -q ":$PUERTO "; then [[ -f "$CARPETA/VERSION" ]] && ok "Sotos ya usa el puerto $PUERTO (se reiniciará)" || { falla "El puerto $PUERTO está ocupado (usa --puerto otro)"; bien=1; }; else ok "Puerto $PUERTO disponible"; fi
  command -v docker >/dev/null && ok "Docker disponible (servicios opcionales)" || aviso "Docker no está: Sotos funciona igual; la oficina completa, Cine y Fotos lo necesitan"
  command -v ffmpeg >/dev/null && ok "ffmpeg disponible" || aviso "ffmpeg no está: los MKV con audio AC3/DTS no se podrán preparar"
  return $bien
}
obtener() {
  if [[ -n "$PAQUETE" ]]; then [[ -f "$PAQUETE" ]] || { falla "No existe $PAQUETE"; exit 1; }; echo "$PAQUETE"; return; fi
  local local_pkg; local_pkg=$(ls -1 "$(dirname "$0")"/sotos-*.tar.gz 2>/dev/null | sort -r | head -n1 || true)
  if [[ -n "$local_pkg" ]]; then echo "$local_pkg"; return; fi
  paso "Buscando la última versión en GitHub" >&2
  local api url name digest; api=$(curl -fsSL -H "User-Agent: Sotos-instalador" "https://api.github.com/repos/$REPO/releases/latest")
  url=$(printf "%s" "$api" | grep -o '"browser_download_url": *"[^"]*sotos-[0-9.]*\.tar\.gz"' | head -n1 | sed 's/.*"\(https[^"]*\)"/\1/')
  [[ -n "$url" ]] || { falla "La versión publicada no trae el paquete" >&2; exit 1; }
  name="${url##*/}"; paso "Descargando $name" >&2; curl -fL --progress-bar -o "/tmp/$name" "$url"
  digest=$(printf "%s" "$api" | tr '{' '\n' | grep "\"name\": *\"$name\"" | grep -o '"digest": *"sha256:[0-9a-f]*"' | sed 's/.*sha256:\([0-9a-f]*\)"/\1/' || true)
  if [[ -n "$digest" ]]; then [[ "$(sha256sum "/tmp/$name" | cut -d' ' -f1)" == "$digest" ]] && ok "Huella SHA-256 verificada" >&2 || { falla "La huella no coincide: no se instaló nada" >&2; exit 1; }; fi
  echo "/tmp/$name"
}
instalar_app() {
  local pkg="$1" tmp; tmp=$(mktemp -d)
  titulo "$([[ $ACCION == actualizar ]] && echo "Actualizando Sotos" || echo "Instalando Sotos")"
  tar -xzf "$pkg" -C "$tmp"; local top; top=$(dirname "$(ls -1 "$tmp"/*/VERSION | head -n1)")
  local ver; ver=$(cat "$top/VERSION"); detener; sleep 0.5
  mkdir -p "$CARPETA"; find "$CARPETA" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +; cp -a "$top/." "$CARPETA/"; rm -rf "$tmp"
  ok "Sotos $ver en $CARPETA"
  mkdir -p "$DATOS"
  [[ -f "$ENVF" ]] || printf "# Sotos — configuración de esta instalación\nNODE_ENV=production\nHOST=0.0.0.0\nPORT=%s\nSOTOS_DATA=%s\nSOTOS_SHOW_LAN=1\n" "$PUERTO" "$DATOS" > "$ENVF"
  chmod 600 "$ENVF"; ok "Datos y configuración: $(dirname "$DATOS")"
  printf '#!/usr/bin/env bash\nexec node --env-file="%s" "%s/server/index.mjs"\n' "$ENVF" "$CARPETA" > "$CARPETA/iniciar-sotos.sh"; chmod +x "$CARPETA/iniciar-sotos.sh"
  cp "$0" "$CARPETA/instalar-sotos.sh" 2>/dev/null || true
  if [[ $SERVICIO == 1 ]] && command -v systemctl >/dev/null; then
    sudo tee /etc/systemd/system/sotos.service >/dev/null <<EOF
[Unit]
Description=Sotos, tu ordenador en la nube
After=network-online.target
[Service]
User=$(id -un)
WorkingDirectory=$CARPETA
ExecStart=$(command -v node) --env-file=$ENVF $CARPETA/server/index.mjs
Restart=always
Environment=SOTOS_SUPERVISED=1
[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload && sudo systemctl enable --now sotos >/dev/null && ok "Servicio sotos activo (arranca solo)"
  else
    nohup "$CARPETA/iniciar-sotos.sh" > "$(dirname "$DATOS")/sotos.log" 2>&1 &
    ok "Sotos corriendo en segundo plano (registro en $(dirname "$DATOS")/sotos.log)"
  fi
  for _ in $(seq 1 40); do curl -fs "http://127.0.0.1:$PUERTO/api/health" >/dev/null 2>&1 && break; sleep 0.5; done
  curl -fs "http://127.0.0.1:$PUERTO/api/health" >/dev/null || { falla "Sotos no respondió: ejecuta $CARPETA/iniciar-sotos.sh para ver el error"; exit 1; }
  VER="$ver"
}

case "$ACCION" in
  comprobar) comprobar && ok "Este equipo puede instalar Sotos" || { falla "Hay requisitos por resolver"; exit 1; } ;;
  desinstalar)
    titulo "Desinstalar Sotos"; pregunta "¿Quitar Sotos de este equipo?" n || exit 0
    detener; [[ -f /etc/systemd/system/sotos.service ]] && { sudo systemctl disable --now sotos || true; sudo rm -f /etc/systemd/system/sotos.service; }
    rm -rf "$CARPETA"; ok "Sotos se quitó de este equipo"
    if pregunta "¿Borrar también los archivos y cuentas en $(dirname "$DATOS")? No se puede deshacer." n; then rm -rf "$(dirname "$DATOS")"; ok "Datos borrados"; else ok "Tus datos siguen en $(dirname "$DATOS")"; fi ;;
  *)
    comprobar || { falla "Resuelve los requisitos y vuelve a ejecutar el instalador."; exit 1; }
    [[ $ACCION == actualizar && ! -f "$CARPETA/VERSION" ]] && { falla "No hay una instalación en $CARPETA"; exit 1; }
    instalar_app "$(obtener)"
    titulo "Listo"
    [[ $ACCION == actualizar ]] && ok "Sotos se actualizó a la versión $VER" || ok "Termina la configuración en el navegador: http://localhost:$PUERTO"
    for ip in $(hostname -I 2>/dev/null); do echo "    Desde otros equipos: http://$ip:$PUERTO"; done ;;
esac
