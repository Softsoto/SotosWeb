# ============================================================
#  Sotos — instalador de un solo archivo para Windows
#  Descárgalo, ejecútalo y listo: revisa el equipo, descarga la última versión de Sotos
#  (o usa el paquete que tenga al lado), lo instala, crea los accesos directos y abre el
#  asistente de instalación en el navegador.
#
#  Uso:  powershell -ExecutionPolicy Bypass -File instalar-sotos.ps1 [-Accion instalar|actualizar|comprobar|desinstalar]
#        [-Carpeta C:\ruta] [-Datos C:\ruta] [-Puerto 8787] [-Paquete sotos-x.y.z.zip] [-SinAccesos] [-SinAbrir] [-Silencioso]
#  © 2026 Sebastian Sotomontes · Licencia MIT
# ============================================================
param(
  [ValidateSet("instalar", "actualizar", "comprobar", "desinstalar", "detener")][string]$Accion = "instalar",
  [string]$Carpeta = (Join-Path $env:LOCALAPPDATA "Programs\Sotos"),
  [string]$Datos = (Join-Path $env:LOCALAPPDATA "Sotos\datos"),
  [int]$Puerto = 8787,
  [string]$Paquete = "",
  [switch]$SinAccesos, [switch]$SinAbrir, [switch]$Silencioso, [switch]$BorrarDatos
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$Repo = "Softsoto/SotosWeb"
$EnvFile = Join-Path (Split-Path $Datos -Parent) "sotos.env"
$Menu = Join-Path ([Environment]::GetFolderPath("Programs")) "Sotos"
$Inicio = Join-Path ([Environment]::GetFolderPath("Startup")) "Sotos.vbs"

function Titulo($t) { Write-Host ""; Write-Host "  $t" -ForegroundColor White; Write-Host ("  " + ("-" * $t.Length)) -ForegroundColor DarkGray }
function Paso($t) { Write-Host "  > $t" -ForegroundColor Gray }
function Ok($t) { Write-Host "  + $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  ! $t" -ForegroundColor Yellow }
function Falla($t) { Write-Host "  x $t" -ForegroundColor Red }
function Pregunta($t, $def = "s") { if ($Silencioso) { return $def -eq "s" }; $r = Read-Host "  ? $t [$def]"; if (-not $r) { $r = $def }; return $r.ToLower().StartsWith("s") }

Write-Host ""
Write-Host "   ____        _" -ForegroundColor DarkYellow
Write-Host "  / ___|  ___ | |_ ___  ___" -ForegroundColor DarkYellow
Write-Host "  \___ \ / _ \| __/ _ \/ __|   tu ordenador en la nube" -ForegroundColor DarkYellow
Write-Host "   ___) | (_) | || (_) \__ \   (c) 2026 Sebastian Sotomontes" -ForegroundColor DarkYellow
Write-Host "  |____/ \___/ \__\___/|___/" -ForegroundColor DarkYellow

function Get-NodeVersion { try { return [int]((node -v) -replace '^v', '').Split('.')[0] } catch { return 0 } }
function Detener {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$Carpeta*index.mjs*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
function Comprobar {
  Titulo "Comprobando este equipo"
  $bien = $true
  $os = [Environment]::OSVersion.Version; if ($os.Major -ge 10) { Ok "Windows $($os.Major).$($os.Minor) (compilación $($os.Build))" } else { Falla "Se necesita Windows 10 u 11"; $bien = $false }
  $n = Get-NodeVersion
  if ($n -ge 22) { Ok "Node.js $(node -v)" } else {
    Aviso "Node.js 22 o superior no está instalado."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      if ($Accion -ne "comprobar" -and (Pregunta "¿Instalarlo ahora con winget?")) {
        winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements | Out-Null
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        if ((Get-NodeVersion) -ge 22) { Ok "Node.js $(node -v) instalado" } else { Falla "No se pudo instalar Node.js. Instálalo desde https://nodejs.org"; $bien = $false }
      } else { $bien = $false }
    } else { Falla "Instala Node.js 22 o superior desde https://nodejs.org"; $bien = $false }
  }
  $libre = [math]::Round((Get-PSDrive ((Split-Path $Datos -Qualifier).TrimEnd(':'))).Free / 1GB, 1)
  if ($libre -ge 2) { Ok "$libre GB libres para tus archivos" } else { Falla "Hay solo $libre GB libres"; $bien = $false }
  $ocupado = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue
  if ($ocupado -and $Accion -eq "instalar") { $p = Get-Process -Id $ocupado[0].OwningProcess -ErrorAction SilentlyContinue; if ($p.Name -eq "node" -and (Test-Path (Join-Path $Carpeta "VERSION"))) { Ok "Sotos ya está corriendo en el puerto $Puerto (se reiniciará)" } else { Falla "El puerto $Puerto está ocupado por $($p.Name). Usa -Puerto otro"; $bien = $false } }
  else { Ok "Puerto $Puerto disponible" }
  if (Get-Command docker -ErrorAction SilentlyContinue) { Ok "Docker disponible (para los servicios opcionales)" } else { Aviso "Docker no está: Sotos funciona igual; la oficina completa, Cine y Fotos necesitan Docker" }
  if (Get-Command ffmpeg -ErrorAction SilentlyContinue) { Ok "ffmpeg disponible (películas MKV)" } else { Aviso "ffmpeg no está: los MKV con audio AC3/DTS no se podrán preparar (winget install Gyan.FFmpeg)" }
  return $bien
}

function Obtener-Paquete {
  if ($Paquete) { if (-not (Test-Path $Paquete)) { throw "No existe el paquete $Paquete" }; return (Resolve-Path $Paquete).Path }
  $local = Get-ChildItem -Path $PSScriptRoot -Filter "sotos-*.zip" -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if ($local) { Ok "Paquete: $($local.Name)"; return $local.FullName }
  Paso "Buscando la última versión de Sotos en GitHub"
  $rel = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "Sotos-instalador" }
  $asset = $rel.assets | Where-Object { $_.name -match '^sotos-[\d.]+\.zip$' } | Select-Object -First 1
  if (-not $asset) { throw "La versión $($rel.tag_name) no trae el paquete para Windows" }
  $dest = Join-Path $env:TEMP $asset.name
  Paso "Descargando $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB)"
  Invoke-WebRequest $asset.browser_download_url -OutFile $dest -UseBasicParsing
  if ($asset.digest) { $h = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower(); if ("sha256:$h" -ne $asset.digest) { Remove-Item $dest; throw "La huella del paquete no coincide: no se instaló nada" }; Ok "Huella SHA-256 verificada" }
  return $dest
}

function Instalar-App($zip) {
  Titulo ($(if ($Accion -eq "actualizar") { "Actualizando Sotos" } else { "Instalando Sotos" }))
  $tmp = Join-Path $env:TEMP ("sotos-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
  Paso "Descomprimiendo"
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $top = Get-ChildItem $tmp -Directory | Where-Object { Test-Path (Join-Path $_.FullName "VERSION") } | Select-Object -First 1
  if (-not $top) { throw "El paquete no tiene el formato esperado" }
  $ver = (Get-Content (Join-Path $top.FullName "VERSION")).Trim()
  Detener; Start-Sleep -Milliseconds 600
  if (Test-Path $Carpeta) { Get-ChildItem $Carpeta -Force | Where-Object { $_.Name -notin @("node_modules") } | Remove-Item -Recurse -Force }
  New-Item -ItemType Directory -Force $Carpeta | Out-Null
  Copy-Item -Path (Join-Path $top.FullName "*") -Destination $Carpeta -Recurse -Force
  Remove-Item $tmp -Recurse -Force
  Ok "Sotos $ver en $Carpeta"
  # configuración y datos FUERA de la carpeta de la aplicación: actualizar nunca los toca
  New-Item -ItemType Directory -Force $Datos | Out-Null
  if (-not (Test-Path $EnvFile)) {
    "# Sotos — configuración de esta instalación (el asistente web completa el resto)`nNODE_ENV=production`nHOST=0.0.0.0`nPORT=$Puerto`nSOTOS_DATA=$Datos`nSOTOS_SHOW_LAN=1`n" | Set-Content -Encoding ascii $EnvFile
  }
  Ok "Tus datos y tu configuración: $(Split-Path $Datos -Parent)"
  # lanzadores
  $node = (Get-Command node).Source
  "@echo off`r`ntitle Sotos`r`n`"$node`" --env-file=`"$EnvFile`" `"$Carpeta\server\index.mjs`"`r`n" | Set-Content -Encoding ascii (Join-Path $Carpeta "iniciar-sotos.cmd")
  @"
' Sotos: arranca el servidor en segundo plano (si no está corriendo) y abre el navegador
Set sh = CreateObject("WScript.Shell")
Function Vivo()
  On Error Resume Next
  Set x = CreateObject("MSXML2.ServerXMLHTTP")
  x.setTimeouts 1500, 1500, 1500, 1500
  x.open "GET", "http://127.0.0.1:$Puerto/api/health", False
  x.send
  Vivo = (Err.Number = 0 And x.status = 200)
End Function
If Not Vivo() Then
  sh.Run """$node"" --env-file=""$EnvFile"" ""$Carpeta\server\index.mjs""", 0, False
  For i = 1 To 40
    WScript.Sleep 500
    If Vivo() Then Exit For
  Next
End If
If WScript.Arguments.Count = 0 Then sh.Run "http://localhost:$Puerto/"
"@ | Set-Content -Encoding ascii (Join-Path $Carpeta "abrir-sotos.vbs")
  Copy-Item $PSCommandPath (Join-Path $Carpeta "instalar-sotos.ps1") -Force -ErrorAction SilentlyContinue
  if (-not $SinAccesos) {
    New-Item -ItemType Directory -Force $Menu | Out-Null
    $sh = New-Object -ComObject WScript.Shell
    $ico = Join-Path $Carpeta "sotos.ico"
    $l = $sh.CreateShortcut((Join-Path $Menu "Sotos.lnk")); $l.TargetPath = "wscript.exe"; $l.Arguments = "`"$Carpeta\abrir-sotos.vbs`""; $l.WorkingDirectory = $Carpeta; $l.Description = "Sotos, tu ordenador en la nube"; if (Test-Path $ico) { $l.IconLocation = $ico }; $l.Save()
    $l = $sh.CreateShortcut((Join-Path $Menu "Detener Sotos.lnk")); $l.TargetPath = "powershell.exe"; $l.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Carpeta\instalar-sotos.ps1`" -Accion detener"; $l.Save()
    $l = $sh.CreateShortcut((Join-Path $Menu "Desinstalar Sotos.lnk")); $l.TargetPath = "powershell.exe"; $l.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Carpeta\instalar-sotos.ps1`" -Accion desinstalar -Carpeta `"$Carpeta`" -Datos `"$Datos`""; $l.Save()
    $d = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Sotos.lnk")); $d.TargetPath = "wscript.exe"; $d.Arguments = "`"$Carpeta\abrir-sotos.vbs`""; $d.WorkingDirectory = $Carpeta; if (Test-Path $ico) { $d.IconLocation = $ico }; $d.Save()
    Ok "Accesos directos en el menú Inicio y el escritorio"
  }
  # arrancar
  Paso "Iniciando Sotos"
  Start-Process wscript.exe -ArgumentList "`"$Carpeta\abrir-sotos.vbs`" sin-abrir" -WorkingDirectory $Carpeta
  $vivo = $false; for ($i = 0; $i -lt 40 -and -not $vivo; $i++) { Start-Sleep -Milliseconds 500; try { $vivo = (Invoke-WebRequest "http://127.0.0.1:$Puerto/api/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch {} }
  if (-not $vivo) { throw "Sotos no respondió. Ejecuta $Carpeta\iniciar-sotos.cmd para ver el error." }
  Ok "Sotos funcionando en http://localhost:$Puerto"
  return $ver
}

try {
  switch ($Accion) {
    "comprobar" { $ok = Comprobar; Write-Host ""; if ($ok) { Ok "Este equipo puede instalar Sotos" } else { Falla "Hay requisitos por resolver" }; exit ([int](-not $ok)) }
    "detener" { Detener; exit 0 }
    "desinstalar" {
      Titulo "Desinstalar Sotos"
      if (-not $Silencioso -and -not (Pregunta "¿Quitar Sotos de este equipo?" "n")) { exit 0 }
      Detener; Start-Sleep -Milliseconds 600
      Remove-Item $Carpeta -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item $Menu -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item $Inicio -Force -ErrorAction SilentlyContinue
      Remove-Item (Join-Path ([Environment]::GetFolderPath("Desktop")) "Sotos.lnk") -Force -ErrorAction SilentlyContinue
      Ok "Sotos se quitó de este equipo"
      if ($BorrarDatos -or (Pregunta "¿Borrar también todos los archivos y cuentas guardados en $(Split-Path $Datos -Parent)? No se puede deshacer." "n")) { Remove-Item (Split-Path $Datos -Parent) -Recurse -Force; Ok "Datos borrados" } else { Ok "Tus datos siguen en $(Split-Path $Datos -Parent)" }
      exit 0
    }
    default {
      if (-not (Comprobar)) { throw "Resuelve los requisitos marcados y vuelve a ejecutar el instalador." }
      if ($Accion -eq "actualizar" -and -not (Test-Path (Join-Path $Carpeta "VERSION"))) { throw "No hay una instalación de Sotos en $Carpeta" }
      $ver = Instalar-App (Obtener-Paquete)
      Titulo "Listo"
      if ($Accion -eq "actualizar") { Ok "Sotos se actualizó a la versión $ver" } else { Ok "Termina la configuración en el navegador: http://localhost:$Puerto" }
      $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -match '^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))' -and $_.PrefixOrigin -ne "WellKnown" -and $_.InterfaceAlias -notmatch "vEthernet|WSL|VirtualBox|VMware|Loopback|Bluetooth" } | Select-Object -ExpandProperty IPAddress -First 2
      foreach ($ip in $ips) { Write-Host "    Desde otros equipos de tu red: http://${ip}:$Puerto" -ForegroundColor Gray }
      if (-not $SinAbrir) { Start-Process "http://localhost:$Puerto/" }
    }
  }
} catch { Write-Host ""; Falla $_.Exception.Message; if (-not $Silencioso) { Read-Host "  Pulsa Enter para cerrar" | Out-Null }; exit 1 }
