# Sotos — servidor de documentos local para desarrollo (Docker Desktop)
# Motores compatibles (misma API y JWT): ONLYOFFICE Docs y Euro-Office (fork europeo de ONLYOFFICE).
# Uso:  powershell -File scripts\onlyoffice-dev.ps1 [-Motor onlyoffice|eurooffice] [-Puerto 8099]
# © 2026 Sebastian Sotomontes
param([ValidateSet("onlyoffice", "eurooffice")][string]$Motor = "onlyoffice", [int]$Puerto = 8099)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$server = Join-Path $root "server"
$images = @{ onlyoffice = "onlyoffice/documentserver:9.1.0"; eurooffice = "ghcr.io/euro-office/documentserver:v9.3.1" }
$image = $images[$Motor]

# secreto compartido: el mismo que usa el servidor (data/secrets.json); Euro-Office exige 32+ caracteres
$secret = node --input-type=module -e "process.chdir('$($server -replace '\\','/')'); const { secret } = await import('file:///$($server -replace '\\','/')/db.mjs'); console.log(secret('oo_jwt'));"
if (-not $secret -or $secret.Length -lt 32) { throw "No se pudo obtener el secreto (o es corto)" }

docker rm -f sotos-docs 2>$null | Out-Null
docker run -d --name sotos-docs --restart unless-stopped -p "${Puerto}:80" `
  -e JWT_ENABLED=true -e "JWT_SECRET=$secret" -e JWT_HEADER=Authorization `
  -e ALLOW_PRIVATE_IP_ADDRESS=true -e ALLOW_META_IP_ADDRESS=true `
  $image | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker no pudo arrancar el contenedor (¿el puerto $Puerto está ocupado? usa -Puerto otro)" }

# variables para el servidor de desarrollo (HOST=0.0.0.0 para que el contenedor alcance a Sotos)
$envFile = Join-Path $server ".env"; $lines = @(); if (Test-Path $envFile) { $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^(OO_URL|OO_ENGINE|SOTOS_INTERNAL)=' } }
$lines += "OO_URL=http://localhost:$Puerto", "SOTOS_INTERNAL=http://host.docker.internal:8787", "OO_ENGINE=$Motor"
$lines | Set-Content -Encoding ascii $envFile  # conserva las demás variables (Neko, etc.)

Write-Host "Servidor de documentos ($Motor, $image) arrancando en http://localhost:$Puerto (la primera vez tarda 1-3 min)."
Write-Host "Reinicia el servidor de Sotos para que lea server\.env"