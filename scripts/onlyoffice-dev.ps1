# Sotos OS — ONLYOFFICE local para desarrollo (Docker Desktop)
# © 2026 Sebastian Sotomontes
# Uso:  powershell -File scripts\onlyoffice-dev.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$server = Join-Path $root "server"

# secreto compartido: el mismo que usa el servidor (data/secrets.json)
$secret = node --input-type=module -e "process.chdir('$($server -replace '\\','/')'); const { secret } = await import('file:///$($server -replace '\\','/')/db.mjs'); console.log(secret('oo_jwt'));"
if (-not $secret) { throw "No se pudo obtener el secreto" }

docker rm -f sotos-onlyoffice 2>$null | Out-Null
docker run -d --name sotos-onlyoffice --restart unless-stopped -p 8080:80 `
  -e JWT_ENABLED=true -e "JWT_SECRET=$secret" -e JWT_HEADER=Authorization `
  -e ALLOW_PRIVATE_IP_ADDRESS=true `
  onlyoffice/documentserver | Out-Null

# variables para el servidor de desarrollo
@"
OO_URL=http://localhost:8080
SOTOS_INTERNAL=http://host.docker.internal:8787
"@ | Set-Content -Encoding ascii (Join-Path $server ".env")

Write-Host "ONLYOFFICE arrancando en http://localhost:8080 (la primera vez tarda 1-2 min)."
Write-Host "Reinicia el servidor de Sotos para que lea server\.env"
