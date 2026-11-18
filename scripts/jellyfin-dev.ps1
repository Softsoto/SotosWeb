# Sotos — Cine con Jellyfin (imagen oficial jellyfin/jellyfin, GPL-2.0)
# Jellyfin solo escucha en este equipo (127.0.0.1); Sotos lo publica en /jellyfin a quien tiene sesión.
# Uso: powershell -File scripts\jellyfin-dev.ps1 [-Puerto 8096]
# © 2026 Sebastian Sotomontes
param([int]$Puerto = 8096)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent; $server = Join-Path $root "server"
$datos = if ($env:SOTOS_DATA) { $env:SOTOS_DATA } else { Join-Path $server "data" }
$cfg = Join-Path $datos "servicios\jellyfin\config"; $cache = Join-Path $datos "servicios\jellyfin\cache"; $bib = Join-Path $datos "biblioteca"
New-Item -ItemType Directory -Force $cfg, $cache, $bib | Out-Null
# Jellyfin publicado bajo /jellyfin (mismo origen que Sotos): BaseUrl en config/network.xml
$netDir = Join-Path $cfg "config"; New-Item -ItemType Directory -Force $netDir | Out-Null; $net = Join-Path $netDir "network.xml"
if (Test-Path $net) { $x = [IO.File]::ReadAllText($net); $x = $x -replace '<BaseUrl\s*/>', '<BaseUrl>/jellyfin</BaseUrl>' -replace '<BaseUrl>[^<]*</BaseUrl>', '<BaseUrl>/jellyfin</BaseUrl>'; if ($x -notmatch '<BaseUrl>') { $x = $x -replace '</NetworkConfiguration>', "  <BaseUrl>/jellyfin</BaseUrl>`r`n</NetworkConfiguration>" }; [IO.File]::WriteAllText($net, $x) }
else { [IO.File]::WriteAllText($net, "<?xml version=`"1.0`" encoding=`"utf-8`"?>`r`n<NetworkConfiguration xmlns:xsd=`"http://www.w3.org/2001/XMLSchema`" xmlns:xsi=`"http://www.w3.org/2001/XMLSchema-instance`">`r`n  <BaseUrl>/jellyfin</BaseUrl>`r`n</NetworkConfiguration>`r`n") }docker rm -f sotos-jellyfin 2>$null | Out-Null
docker run -d --name sotos-jellyfin --restart unless-stopped -p "127.0.0.1:${Puerto}:8096" -v "${cfg}:/config" -v "${cache}:/cache" -v "${bib}:/media:ro" -e TZ=America/Bogota jellyfin/jellyfin:10.10.7 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker no pudo arrancar Jellyfin (¿puerto $Puerto ocupado?)" }
$envFile = Join-Path $server ".env"; $lines = @(); if (Test-Path $envFile) { $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^JELLYFIN_URL=' } }
$lines += "JELLYFIN_URL=http://127.0.0.1:$Puerto"; $lines | Set-Content -Encoding ascii $envFile
Write-Host "Jellyfin listo. Reinicia el servidor de Sotos para que lea server\.env; la app Cine lo configura sola."
