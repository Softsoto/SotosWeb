<#
  Sotos OS — instalador para Windows
  © 2026 Sebastian Sotomontes

  Modos:
    equipo  Sotos corre en este PC y queda disponible en el navegador
            (http://localhost:8787) y para los demás equipos de tu red (http://TU-IP:8787).
    docker  Sotos + ONLYOFFICE en contenedores (Docker Desktop). Por IP o con dominio y HTTPS.

  Uso:
    powershell -ExecutionPolicy Bypass -File instalar.ps1               (asistente)
    powershell -ExecutionPolicy Bypass -File instalar.ps1 -Modo equipo -Inicio -Firewall
    powershell -ExecutionPolicy Bypass -File instalar.ps1 -Modo docker
    powershell -ExecutionPolicy Bypass -File instalar.ps1 -Actualizar
    powershell -ExecutionPolicy Bypass -File instalar.ps1 -Desinstalar
#>
param(
  [ValidateSet("", "equipo", "docker")] [string]$Modo = "",
  [int]$Puerto = 8787,
  [switch]$Inicio,      # arrancar Sotos al iniciar sesión en Windows
  [switch]$Firewall,    # permitir la entrada desde otros equipos de la red
  [switch]$Actualizar,
  [switch]$Desinstalar
)
$ErrorActionPreference = "Stop"
$Raiz = $PSScriptRoot
$Datos = Join-Path $env:LOCALAPPDATA "SotosOS"
$EnvFile = Join-Path $Raiz "server\sotos.env"
$Lanzador = Join-Path $Raiz "iniciar-sotos.cmd"
$Oculto = Join-Path $Raiz "iniciar-sotos-oculto.vbs"
$Atajo = Join-Path ([Environment]::GetFolderPath("Startup")) "Sotos OS.lnk"

function Titulo($t) { Write-Host ""; Write-Host "  $t" -ForegroundColor Yellow; Write-Host ("  " + ("-" * $t.Length)) -ForegroundColor DarkYellow }
function Paso($t) { Write-Host "  > $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  OK $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  !  $t" -ForegroundColor DarkYellow }
function Pregunta($t, $def = "s") { $r = Read-Host "  ? $t [$def]"; if (-not $r) { $r = $def }; return $r.ToLower().StartsWith("s") }
function IPs { Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } | Sort-Object InterfaceMetric | Select-Object -ExpandProperty IPAddress -Unique }
function Detener { Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*sotos.env*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force } }
function Secreto { $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString("x2") }) -join "" }

Write-Host ""
Write-Host "   sotos  ·  tu ordenador en la nube" -ForegroundColor White
Write-Host "   instalador para Windows · (c) 2026 Sebastian Sotomontes" -ForegroundColor DarkGray

# ---------------- desinstalar ----------------
if ($Desinstalar) {
  Titulo "Desinstalar"
  Detener; Remove-Item $Atajo, $Lanzador, $Oculto, $EnvFile -Force -ErrorAction SilentlyContinue
  if (Get-NetFirewallRule -DisplayName "Sotos OS" -ErrorAction SilentlyContinue) { Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -Command "Remove-NetFirewallRule -DisplayName ''Sotos OS''"' }
  Ok "Sotos se detuvo y ya no arranca con Windows."
  Aviso "Tus archivos siguen en $Datos (bórralos a mano si quieres)."
  exit 0
}

# ---------------- elegir modo ----------------
if ($Actualizar) { if (Test-Path $EnvFile) { $Modo = "equipo" } elseif (Test-Path (Join-Path $Raiz ".env")) { $Modo = "docker" } else { throw "No hay una instalación que actualizar." } }
if (-not $Modo) {
  Titulo "¿Dónde quieres instalar Sotos?"
  Write-Host "    1) En este equipo     Node.js · rápido · para ti y tu red local"
  Write-Host "    2) Con Docker         Sotos + ONLYOFFICE (Word, Excel y PowerPoint completos)"
  Write-Host "    Para un servidor Linux (hosting/VPS) usa instalar.sh"
  $Modo = if ((Read-Host "  ? Opción [1]") -eq "2") { "docker" } else { "equipo" }
}

# ---------------- privacidad de las bóvedas ----------------
$BovedaAdmin = 0
if (-not $Actualizar) {
  Titulo "Bóvedas secretas de los usuarios"
  Write-Host "    Cada cuenta tiene una bóveda cifrada con su propia clave."
  Write-Host "    Puedes permitir que el administrador también la revise (por ejemplo, para moderar contenido)."
  Write-Host "    Cada usuario verá en su bóveda cuál de las dos reglas tiene este servidor."
  if (Pregunta "¿El administrador podrá ver las bóvedas de los usuarios? (s/n)" "n") { $BovedaAdmin = 1 }
}

# =====================================================================
if ($Modo -eq "equipo") {
  Titulo "Instalación en este equipo"
  # 1. Node.js
  Paso "Comprobando Node.js (se necesita la versión 22 o superior)"
  $nodeOk = $false
  try { $v = (node -v) -replace 'v', ''; $nodeOk = [int]($v.Split('.')[0]) -ge 22 } catch {}
  if (-not $nodeOk) {
    if (Pregunta "Node.js 22+ no está instalado. ¿Instalarlo con winget?") {
      winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
      $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    } else { throw "Instala Node.js 22 o superior desde https://nodejs.org y vuelve a ejecutar el instalador." }
  }
  Ok "Node.js $(node -v)"

  # 2. compilar el escritorio
  if ($Actualizar -and (Test-Path (Join-Path $Raiz ".git"))) { Paso "Descargando la última versión"; git -C $Raiz pull --ff-only }
  Paso "Instalando dependencias y compilando el escritorio (1-3 min)"
  Push-Location (Join-Path $Raiz "web")
  try { npm ci --no-audit --no-fund --loglevel=error; if ($LASTEXITCODE) { throw "npm ci falló" }; npm run build --silent; if ($LASTEXITCODE) { throw "La compilación falló" } } finally { Pop-Location }
  Ok "Escritorio compilado"

  # 3. configuración
  New-Item -ItemType Directory -Force $Datos | Out-Null
  if (-not (Test-Path $EnvFile)) {
    @"
# Sotos OS — configuración de esta instalación (generada por instalar.ps1)
NODE_ENV=production
HOST=0.0.0.0
PORT=$Puerto
PX_PORT=$($Puerto + 1)
SOTOS_DATA=$Datos
SOTOS_SHOW_LAN=1
SOTOS_REGISTRATION=open
SOTOS_VAULT_ADMIN=$BovedaAdmin
SOTOS_QUOTA_MB=10240
"@ | Set-Content -Encoding ascii $EnvFile
  }
  $Puerto = [int]((Get-Content $EnvFile | Where-Object { $_ -match '^PORT=' }) -replace 'PORT=', '')
  "@echo off`r`ncd /d `"%~dp0`"`r`ntitle Sotos OS`r`nnode --env-file=server\sotos.env server\index.mjs`r`n" | Set-Content -Encoding ascii $Lanzador
  "CreateObject(""WScript.Shell"").Run """"""$Lanzador"""""", 0, False" | Set-Content -Encoding ascii $Oculto
  Ok "Configuración en server\sotos.env · tus archivos en $Datos"

  # 4. arranque con Windows
  if ($Inicio -or (-not $Actualizar -and (Pregunta "¿Arrancar Sotos automáticamente al iniciar Windows?"))) {
    $sh = New-Object -ComObject WScript.Shell; $lnk = $sh.CreateShortcut($Atajo)
    $lnk.TargetPath = "wscript.exe"; $lnk.Arguments = "`"$Oculto`""; $lnk.WorkingDirectory = $Raiz; $lnk.Description = "Sotos OS"; $lnk.Save()
    Ok "Sotos arrancará con Windows (en segundo plano)"
  }
  # 5. firewall para la red local
  if ($Firewall -or (-not $Actualizar -and (Pregunta "¿Permitir que otros equipos de tu red entren a Sotos? (pide permiso de administrador)"))) {
    $cmd = "Remove-NetFirewallRule -DisplayName 'Sotos OS' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName 'Sotos OS' -Direction Inbound -Protocol TCP -LocalPort $Puerto,$($Puerto + 1) -Profile Private -Action Allow | Out-Null"
    try { Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile -Command `"$cmd`""; Ok "Firewall: puertos $Puerto y $($Puerto + 1) abiertos en redes privadas" } catch { Aviso "No se abrió el firewall (permiso denegado)" }
  }

  # 6. arrancar
  Paso "Iniciando Sotos"
  Detener; Start-Process wscript.exe -ArgumentList "`"$Oculto`"" -WorkingDirectory $Raiz
  $ok = $false; for ($i = 0; $i -lt 30 -and -not $ok; $i++) { Start-Sleep -Milliseconds 500; try { $ok = (Invoke-WebRequest -UseBasicParsing "http://localhost:$Puerto/api/health" -TimeoutSec 2).StatusCode -eq 200 } catch {} }
  if (-not $ok) { throw "Sotos no respondió. Ejecuta iniciar-sotos.cmd para ver el error." }

  Titulo "Sotos está listo"
  Write-Host "    En este equipo:        http://localhost:$Puerto" -ForegroundColor White
  foreach ($ip in IPs) { Write-Host "    Desde tu red (Wi-Fi):  http://${ip}:$Puerto" -ForegroundColor White }
  Write-Host ""
  Write-Host "    La primera cuenta que crees es la tuya. Para Word/Excel completos usa el modo Docker." -ForegroundColor DarkGray
  Start-Process "http://localhost:$Puerto"
  exit 0
}

# =====================================================================
if ($Modo -eq "docker") {
  Titulo "Instalación con Docker"
  Paso "Comprobando Docker"
  try { docker version --format '{{.Server.Version}}' | Out-Null; if ($LASTEXITCODE) { throw } } catch { throw "Docker no está en marcha. Instala/abre Docker Desktop (y reinicia si te lo pide) y vuelve a ejecutar el instalador." }
  Ok "Docker $(docker version --format '{{.Server.Version}}')"
  Set-Location $Raiz
  $envPath = Join-Path $Raiz ".env"
  $ips = @(IPs)
  if (-not (Test-Path $envPath)) {
    $dominio = Read-Host "  ? ¿Tienes un dominio para Sotos? Escribe el principal (ej. os.midominio.com) o deja vacío para usar la IP"
    $secreto = Secreto
    if ($dominio) {
      $base = ($dominio -split '\.', 2)[1]
      @"
SOTOS_DOMAIN=$dominio
PX_DOMAIN=px.$base
OFFICE_DOMAIN=office.$base
OO_JWT_SECRET=$secreto
SOTOS_REGISTRATION=open
SOTOS_VAULT_ADMIN=$BovedaAdmin
SOTOS_QUOTA_MB=2048
OO_VERSION=latest
"@ | Set-Content -Encoding ascii $envPath
      Aviso "Crea registros DNS A para $dominio, px.$base y office.$base apuntando a la IP pública de este equipo."
    } else {
      $ip = if ($ips.Count) { $ips[0] } else { "localhost" }
      @"
COMPOSE_FILE=docker-compose.ip.yml
SOTOS_IP=$ip
OO_JWT_SECRET=$secreto
SOTOS_REGISTRATION=open
SOTOS_VAULT_ADMIN=$BovedaAdmin
SOTOS_QUOTA_MB=2048
OO_VERSION=latest
"@ | Set-Content -Encoding ascii $envPath
    }
    Ok "Configuración en .env (secreto de ONLYOFFICE generado)"
  }
  if ($Actualizar -and (Test-Path (Join-Path $Raiz ".git"))) { Paso "Descargando la última versión"; git pull --ff-only }
  Paso "Construyendo y arrancando contenedores (la primera vez tarda varios minutos)"
  docker compose up -d --build
  if ($LASTEXITCODE) { throw "docker compose falló" }
  $cfg = Get-Content $envPath | ConvertFrom-StringData
  Titulo "Sotos está arrancando"
  if ($cfg.SOTOS_DOMAIN) {
    Write-Host "    Escritorio:   https://$($cfg.SOTOS_DOMAIN)" -ForegroundColor White
    Write-Host "    ONLYOFFICE:   https://$($cfg.OFFICE_DOMAIN)" -ForegroundColor White
  } else {
    Write-Host "    En este equipo:        http://localhost:8787" -ForegroundColor White
    foreach ($ip in $ips) { Write-Host "    Desde tu red:          http://${ip}:8787" -ForegroundColor White }
    Write-Host "    ONLYOFFICE tarda 1-2 minutos más en estar listo la primera vez." -ForegroundColor DarkGray
  }
  exit 0
}
