# Sotos — Navegador virtual (Neko: Firefox real en el servidor, transmitido por WebRTC)
# Abre dentro de Sotos las páginas que no se dejan mostrar en otra web (iLovePDF, bancos, inicios de sesión).
# Uso:  powershell -File scripts\neko-dev.ps1 [-Puerto 8098]
# © 2026 Sebastian Sotomontes
param([int]$Puerto = 8098)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent; $server = Join-Path $root "server"
$image = "ghcr.io/m1k1o/neko/firefox:3.0.8"
# contraseña de la sesión: secreto del servidor de Sotos (data/secrets.json)
$pass = node --input-type=module -e "process.chdir('$($server -replace '\\','/')'); const { secret } = await import('file:///$($server -replace '\\','/')/db.mjs'); console.log(secret('neko').slice(0, 24));"
docker rm -f sotos-neko 2>$null | Out-Null
docker run -d --name sotos-neko --restart unless-stopped --shm-size=2g -p "${Puerto}:8080" -p 52000-52020:52000-52020/udp `
  -e NEKO_DESKTOP_SCREEN=1600x900@30 `
  -e NEKO_MEMBER_PROVIDER=multiuser -e "NEKO_MEMBER_MULTIUSER_USER_PASSWORD=$pass" -e "NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=$pass" `
  -e NEKO_WEBRTC_EPR=52000-52020 -e NEKO_WEBRTC_ICELITE=1 -e NEKO_WEBRTC_NAT1TO1=127.0.0.1 `
  $image | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker no pudo arrancar Neko (¿puerto $Puerto o 52000-52020/udp ocupados?)" }
$envFile = Join-Path $server ".env"; $lines = @(); if (Test-Path $envFile) { $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^NEKO_' } }
$lines += "NEKO_URL=http://localhost:$Puerto"; $lines += "NEKO_CONTAINER=sotos-neko"; $lines | Set-Content -Encoding ascii $envFile
Write-Host "Navegador virtual en http://localhost:$Puerto. Reinicia el servidor de Sotos para que lea server\.env"