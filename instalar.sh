#!/usr/bin/env bash
# =====================================================================
#  Sotos OS — instalador para Linux y macOS
#  © 2026 Sebastian Sotomontes
#
#  Modos:
#    equipo    Sotos en este equipo (Node.js), para ti y tu red local.
#    servidor  Hosting/VPS Linux sin Docker: servicio systemd que arranca solo
#              y, si tienes dominio, HTTPS automático con Caddy.
#    docker    Sotos + ONLYOFFICE en contenedores, por IP o con dominio y HTTPS.
#
#  Uso:  ./instalar.sh                    (asistente)
#        ./instalar.sh servidor os.midominio.com
#        ./instalar.sh docker
#        ./instalar.sh actualizar | desinstalar
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"
RAIZ="$(pwd)"
MODO="${1:-}"; DOMINIO="${2:-}"
PUERTO="${SOTOS_PORT:-8787}"

c() { printf "\033[%sm%s\033[0m\n" "$1" "$2"; }
titulo() { echo; c "1;33" "  $1"; }
paso() { c "36" "  > $1"; }
ok() { c "32" "  OK $1"; }
aviso() { c "33" "  !  $1"; }
pregunta() { local r; read -r -p "  ? $1 [${2:-s}] " r || true; r="${r:-${2:-s}}"; [[ "${r,,}" == s* ]]; }
ips() { (hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || true) | tr ' ' '\n' | grep -E '^[0-9]+\.' | grep -vE '^(127\.|169\.254\.|172\.(1[7-9]|2[0-9]|3[01])\.)' || true; }
ip_publica() { curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true; }
secreto() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
sudo_() { if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi; }

echo; c "1" "   sotos  ·  tu ordenador en la nube"; c "2" "   instalador para Linux y macOS · (c) 2026 Sebastian Sotomontes"

necesita_node() {
  paso "Comprobando Node.js (22 o superior)"
  if ! command -v node >/dev/null || (( $(node -p 'process.versions.node.split(".")[0]') < 22 )); then
    if [[ "$(uname)" == "Linux" ]] && command -v apt-get >/dev/null && pregunta "Node.js 22+ no está. ¿Instalarlo desde NodeSource?"; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo_ bash - && sudo_ apt-get install -y nodejs
    else
      echo "  Instala Node.js 22+ (https://nodejs.org) y vuelve a ejecutar."; exit 1
    fi
  fi
  ok "Node.js $(node -v)"
}
compilar() {
  paso "Compilando el escritorio (1-3 min)"
  (cd web && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent)
  ok "Escritorio compilado"
}
esperar() { for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:$1/api/health" >/dev/null 2>&1 && return 0; sleep 0.5; done; return 1; }
mostrar_ips() {
  titulo "Sotos está listo"
  echo "    En este equipo:   http://localhost:$PUERTO"
  for ip in $(ips); do echo "    Desde tu red:     http://$ip:$PUERTO"; done
  local pub; pub="$(ip_publica)"; [[ -n "$pub" ]] && echo "    IP pública:       $pub   (abre los puertos $PUERTO y $((PUERTO+1)) para entrar desde internet)"
  return 0
}

[[ -z "$MODO" ]] && {
  titulo "¿Dónde quieres instalar Sotos?"
  echo "    1) En este equipo   (Node.js, para ti y tu red local)"
  echo "    2) Servidor/hosting (VPS Linux: servicio que arranca solo, HTTPS con dominio)"
  echo "    3) Docker           (Sotos + ONLYOFFICE: Word, Excel y PowerPoint completos)"
  read -r -p "  ? Opción [1] " op || true
  case "${op:-1}" in 2) MODO=servidor;; 3) MODO=docker;; *) MODO=equipo;; esac
}

BOVEDA_ADMIN=0
if [[ "$MODO" != "actualizar" && "$MODO" != "desinstalar" ]]; then
  titulo "Bóvedas secretas de los usuarios"
  echo "    Cada cuenta tiene una bóveda cifrada con su propia clave."
  echo "    Puedes permitir que el administrador también la revise (por ejemplo, para moderar contenido)."
  echo "    Cada usuario verá en su bóveda cuál de las dos reglas tiene este servidor."
  pregunta "¿El administrador podrá ver las bóvedas de los usuarios? (s/n)" n && BOVEDA_ADMIN=1
fi

case "$MODO" in
# ---------------------------------------------------------------------
equipo)
  titulo "Instalación en este equipo"
  necesita_node; compilar
  DATOS="${SOTOS_DATA:-$HOME/.local/share/sotos-os}"; mkdir -p "$DATOS"
  [[ -f server/sotos.env ]] || cat > server/sotos.env <<EOF
# Sotos OS — generado por instalar.sh
NODE_ENV=production
HOST=0.0.0.0
PORT=$PUERTO
PX_PORT=$((PUERTO+1))
SOTOS_DATA=$DATOS
SOTOS_SHOW_LAN=1
SOTOS_REGISTRATION=open
SOTOS_VAULT_ADMIN=$BOVEDA_ADMIN
SOTOS_QUOTA_MB=10240
EOF
  cat > iniciar-sotos.sh <<'EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")" && exec node --env-file=server/sotos.env server/index.mjs
EOF
  chmod +x iniciar-sotos.sh
  pkill -f "env-file=server/sotos.env" 2>/dev/null || true
  nohup ./iniciar-sotos.sh > "$DATOS/sotos.log" 2>&1 &
  esperar "$PUERTO" || { echo "  Sotos no respondió; revisa $DATOS/sotos.log"; exit 1; }
  if [[ "$(uname)" == "Linux" ]] && command -v systemctl >/dev/null && pregunta "¿Arrancar Sotos al iniciar sesión? (servicio de usuario)"; then
    mkdir -p ~/.config/systemd/user
    cat > ~/.config/systemd/user/sotos-os.service <<EOF
[Unit]
Description=Sotos OS
[Service]
ExecStart=$RAIZ/iniciar-sotos.sh
Restart=on-failure
[Install]
WantedBy=default.target
EOF
    pkill -f "env-file=server/sotos.env" || true
    systemctl --user daemon-reload && systemctl --user enable --now sotos-os.service && ok "Servicio de usuario activo"
  fi
  mostrar_ips ;;

# ---------------------------------------------------------------------
servidor)
  titulo "Instalación en servidor (hosting/VPS)"
  [[ "$(uname)" == "Linux" ]] && command -v systemctl >/dev/null || { echo "  Este modo necesita Linux con systemd."; exit 1; }
  necesita_node
  DESTINO=/opt/sotos-os
  paso "Copiando a $DESTINO"
  sudo_ mkdir -p "$DESTINO" /var/lib/sotos-os
  sudo_ rsync -a --delete --exclude node_modules --exclude .git --exclude server/data --exclude .env ./ "$DESTINO/" 2>/dev/null || sudo_ cp -r . "$DESTINO/"
  sudo_ chown -R "$(id -u):$(id -g)" "$DESTINO"
  (cd "$DESTINO" && compilar)
  id sotos >/dev/null 2>&1 || sudo_ useradd --system --home /var/lib/sotos-os --shell /usr/sbin/nologin sotos
  sudo_ chown -R sotos:sotos /var/lib/sotos-os
  [[ -z "$DOMINIO" ]] && read -r -p "  ? Dominio para Sotos (ej. os.midominio.com) o vacío para usar la IP: " DOMINIO || true
  if [[ -n "$DOMINIO" ]]; then
    BASE="${DOMINIO#*.}"; PXD="px.$BASE"
    ENVTXT="NODE_ENV=production
HOST=127.0.0.1
PORT=$PUERTO
PX_HOST=$PXD
PX_PUBLIC=https://$PXD
TRUST_PROXY=1
SOTOS_DATA=/var/lib/sotos-os
SOTOS_REGISTRATION=open
SOTOS_VAULT_ADMIN=$BOVEDA_ADMIN"
  else
    ENVTXT="NODE_ENV=production
HOST=0.0.0.0
PORT=$PUERTO
PX_PORT=$((PUERTO+1))
SOTOS_DATA=/var/lib/sotos-os
SOTOS_REGISTRATION=open
SOTOS_VAULT_ADMIN=$BOVEDA_ADMIN"
  fi
  echo "$ENVTXT" | sudo_ tee /etc/sotos-os.env >/dev/null; sudo_ chmod 600 /etc/sotos-os.env
  sudo_ tee /etc/systemd/system/sotos-os.service >/dev/null <<EOF
[Unit]
Description=Sotos OS — tu ordenador en la nube
After=network-online.target
[Service]
User=sotos
EnvironmentFile=/etc/sotos-os.env
WorkingDirectory=$DESTINO
ExecStart=$(command -v node) $DESTINO/server/index.mjs
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/sotos-os
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
  sudo_ systemctl daemon-reload && sudo_ systemctl enable --now sotos-os
  esperar "$PUERTO" || { sudo_ journalctl -u sotos-os -n 30 --no-pager; exit 1; }
  ok "Servicio sotos-os activo (se reinicia solo)"
  if [[ -n "$DOMINIO" ]]; then
    if ! command -v caddy >/dev/null; then
      paso "Instalando Caddy (HTTPS automático)"
      sudo_ apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl >/dev/null
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo_ gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo_ tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
      sudo_ apt-get update >/dev/null && sudo_ apt-get install -y caddy >/dev/null
    fi
    sudo_ tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMINIO {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PUERTO {
		flush_interval -1
	}
}
$PXD {
	reverse_proxy 127.0.0.1:$PUERTO
}
EOF
    sudo_ systemctl reload caddy || sudo_ systemctl restart caddy
    titulo "Sotos está listo"
    echo "    https://$DOMINIO"
    echo "    DNS: registros A de $DOMINIO y $PXD hacia $(ip_publica)"
  else
    mostrar_ips
  fi ;;

# ---------------------------------------------------------------------
docker)
  titulo "Instalación con Docker"
  command -v docker >/dev/null && docker compose version >/dev/null 2>&1 || { echo "  Instala Docker Engine con el plugin compose: https://docs.docker.com/engine/install/"; exit 1; }
  if [[ ! -f .env ]]; then
    [[ -z "$DOMINIO" ]] && read -r -p "  ? Dominio (ej. os.midominio.com) o vacío para usar la IP: " DOMINIO || true
    S="$(secreto)"
    if [[ -n "$DOMINIO" ]]; then
      BASE="${DOMINIO#*.}"
      printf 'SOTOS_DOMAIN=%s\nPX_DOMAIN=px.%s\nOFFICE_DOMAIN=office.%s\nOO_JWT_SECRET=%s\nSOTOS_REGISTRATION=open\nSOTOS_VAULT_ADMIN=%s\nSOTOS_QUOTA_MB=2048\nOO_VERSION=latest\n' "$DOMINIO" "$BASE" "$BASE" "$S" "$BOVEDA_ADMIN" > .env
      aviso "Registros DNS A: $DOMINIO, px.$BASE y office.$BASE → $(ip_publica)"
    else
      IP="$(ip_publica)"; [[ -z "$IP" ]] && IP="$(ips | head -n1)"
      printf 'COMPOSE_FILE=docker-compose.ip.yml\nSOTOS_IP=%s\nOO_JWT_SECRET=%s\nSOTOS_REGISTRATION=open\nSOTOS_VAULT_ADMIN=%s\nSOTOS_QUOTA_MB=2048\nOO_VERSION=latest\n' "$IP" "$S" "$BOVEDA_ADMIN" > .env
    fi
    chmod 600 .env; ok "Configuración en .env (secreto generado)"
  fi
  paso "Construyendo y arrancando (la primera vez tarda varios minutos)"
  docker compose up -d --build
  set -a; . ./.env; set +a
  titulo "Sotos está arrancando"
  if [[ -n "${SOTOS_DOMAIN:-}" ]]; then echo "    https://$SOTOS_DOMAIN   ·   ONLYOFFICE: https://$OFFICE_DOMAIN"
  else echo "    http://$SOTOS_IP:8787   (ONLYOFFICE en http://$SOTOS_IP:8080, tarda 1-2 min)"; for ip in $(ips); do echo "    En tu red: http://$ip:8787"; done; fi ;;

# ---------------------------------------------------------------------
actualizar)
  [[ -d .git ]] && git pull --ff-only
  if [[ -f .env ]]; then docker compose up -d --build
  elif [[ -f /etc/sotos-os.env ]]; then exec "$0" servidor
  else exec "$0" equipo; fi ;;
desinstalar)
  pkill -f "env-file=server/sotos.env" 2>/dev/null || true
  systemctl --user disable --now sotos-os.service 2>/dev/null || true
  [[ -f /etc/systemd/system/sotos-os.service ]] && sudo_ systemctl disable --now sotos-os && sudo_ rm -f /etc/systemd/system/sotos-os.service
  [[ -f .env ]] && docker compose down
  ok "Sotos detenido. Tus datos no se borraron." ;;
*) echo "  Modo desconocido: $MODO (equipo | servidor | docker | actualizar | desinstalar)"; exit 1 ;;
esac
