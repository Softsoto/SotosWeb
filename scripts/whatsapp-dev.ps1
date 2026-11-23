# Sotos — servicio de WhatsApp para desarrollo (cada cuenta vincula su propio WhatsApp)
# AVISO: usa un cliente NO oficial (Baileys); WhatsApp puede suspender números que lo usan.
# Uso:  powershell -File scripts\whatsapp-dev.ps1 [-Puerto 8790]
# © 2026 Sebastian Sotomontes
param([int]$Puerto = 8790)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent; $server = Join-Path $root "server"; $svc = Join-Path $root "services\whatsapp"
if (-not (Test-Path (Join-Path $svc "node_modules"))) { Push-Location $svc; npm install --no-audit --no-fund; Pop-Location }
$secret = node --input-type=module -e "process.chdir('$($server -replace '\\','/')'); const { secret } = await import('file:///$($server -replace '\\','/')/db.mjs'); console.log(secret('wa'));"
$envFile = Join-Path $server ".env"; $lines = @(); if (Test-Path $envFile) { $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^WA_URL=' } }
$lines += "WA_URL=http://127.0.0.1:$Puerto"; $lines | Set-Content -Encoding ascii $envFile
$env:WA_SECRET = $secret; $env:WA_PORT = "$Puerto"
Write-Host "Servicio de WhatsApp en 127.0.0.1:$Puerto. Reinicia el servidor de Sotos para que lea server\.env"
# vigilante: si el servicio se cierra por cualquier motivo, se vuelve a levantar (sin perder la sesión vinculada)
$fallos = 0
while ($true) {
  $inicio = Get-Date
  node (Join-Path $svc "index.mjs")
  if (((Get-Date) - $inicio).TotalSeconds -gt 60) { $fallos = 0 } else { $fallos++ }
  $espera = [Math]::Min(30, 2 * [Math]::Max(1, $fallos))
  Write-Host "El servicio de WhatsApp se cerró (código $LASTEXITCODE). Se reinicia en $espera s. Ctrl+C para detenerlo."
  Start-Sleep -Seconds $espera
}