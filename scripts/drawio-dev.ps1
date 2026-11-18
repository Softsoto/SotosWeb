# Sotos — draw.io propio para Diagramas (imagen oficial jgraph/drawio, Apache 2.0)
# Con esto los diagramas no dependen de diagrams.net. Uso: powershell -File scripts\drawio-dev.ps1 [-Puerto 8097]
# © 2026 Sebastian Sotomontes
param([int]$Puerto = 8097)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent; $server = Join-Path $root "server"
docker rm -f sotos-drawio 2>$null | Out-Null
docker run -d --name sotos-drawio --restart unless-stopped -p "${Puerto}:8080" jgraph/drawio:32.6.9 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker no pudo arrancar draw.io (¿puerto $Puerto ocupado?)" }
$envFile = Join-Path $server ".env"; $lines = @(); if (Test-Path $envFile) { $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^DRAWIO_URL=' } }
$lines += "DRAWIO_URL=http://localhost:$Puerto"; $lines | Set-Content -Encoding ascii $envFile
Write-Host "draw.io en http://localhost:$Puerto. Reinicia el servidor de Sotos para que lea server\.env"