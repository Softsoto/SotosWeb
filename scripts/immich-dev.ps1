# Sotos — Fotos con Immich (AGPL-3.0): servidor, aprendizaje automático, Redis y Postgres en Docker
# Usa la configuración oficial de la versión indicada y le añade, sin tocar los archivos oficiales:
#   · Immich solo en este equipo (127.0.0.1:2283)
#   · la base de datos en un volumen de Docker (Postgres no funciona bien sobre carpetas de Windows)
#   · las fotos y videos de Sotos como biblioteca externa de SOLO LECTURA (/mnt/sotos)
# Uso: powershell -File scripts\immich-dev.ps1 [-Version v3.4.1]
# © 2026 Sebastian Sotomontes
param([string]$Version = "v3.4.1")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent; $server = Join-Path $root "server"
$datos = if ($env:SOTOS_DATA) { $env:SOTOS_DATA } else { Join-Path $server "data" }
$dir = Join-Path $datos "servicios\immich"; $bib = Join-Path $datos "biblioteca"
New-Item -ItemType Directory -Force $dir, $bib | Out-Null
foreach ($f in "docker-compose.yml", "example.env") { Invoke-WebRequest "https://github.com/immich-app/immich/releases/download/$Version/$f" -OutFile (Join-Path $dir $f) -UseBasicParsing }
$enc = New-Object Text.UTF8Encoding $false
$envFile = Join-Path $dir ".env"
if (-not (Test-Path $envFile)) {
  $pw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
  [IO.File]::WriteAllText($envFile, "UPLOAD_LOCATION=./library`nDB_DATA_LOCATION=./postgres`nTZ=America/Bogota`nIMMICH_VERSION=$Version`nDB_PASSWORD=$pw`nDB_USERNAME=postgres`nDB_DATABASE_NAME=immich`n", $enc)
} else { (Get-Content $envFile) -replace '^IMMICH_VERSION=.*', "IMMICH_VERSION=$Version" | Set-Content -Encoding ascii $envFile }
$bibPosix = ($bib -replace '\\', '/')
[IO.File]::WriteAllText((Join-Path $dir "docker-compose.override.yml"), @"
services:
  immich-server:
    ports: !override
      - '127.0.0.1:2283:2283'
    volumes:
      - ${bibPosix}:/mnt/sotos:ro
  database:
    volumes: !override
      - immich-db:/var/lib/postgresql/data
volumes:
  immich-db:
"@, $enc)
Push-Location $dir; try { docker compose up -d; if ($LASTEXITCODE -ne 0) { throw "Docker no pudo arrancar Immich" } } finally { Pop-Location }
$sotosEnv = Join-Path $server ".env"; $lines = @(); if (Test-Path $sotosEnv) { $lines = Get-Content $sotosEnv | Where-Object { $_ -notmatch '^IMMICH_URL=' } }
$lines += "IMMICH_URL=http://127.0.0.1:2283"; $lines | Set-Content -Encoding ascii $sotosEnv
Write-Host "Immich listo. Reinicia el servidor de Sotos para que lea server\.env; la app Fotos lo configura sola."
