# Sincroniza tus proyectos HTML como apps de la Tienda de Sotos (web/public/apps/<id>)
# © 2026 Sebastian Sotomontes
$src = "D:\Sebastian\Proyectos"; $dst = Join-Path $PSScriptRoot "..\web\public\apps"
$map = @{ pdfmeta = "AnalizadorMetadatosPDF"; audioext = "ExtractorAudio"; informes = "GeneradorInformes"; diagnostico = "EstacionDiagnostico"; panel = "DashboardPersonal"; pinball = "ParamoPinball" }
foreach ($id in $map.Keys) {
  $from = Join-Path $src $map[$id]; $to = Join-Path $dst $id
  if (-not (Test-Path $from)) { Write-Warning "No existe $from"; continue }
  Remove-Item $to -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force $to | Out-Null
  Get-ChildItem $from -Recurse -File | Where-Object { $_.FullName -notmatch '\\(\.git|node_modules|PinballRE)\\' -and $_.Name -notmatch '^(README\.md|selftest\.js|.*\.ps1)$' } | ForEach-Object {
    $rel = $_.FullName.Substring($from.Length + 1); $t = Join-Path $to $rel; New-Item -ItemType Directory -Force (Split-Path $t) | Out-Null; Copy-Item $_.FullName $t }
  "{0,-12} <- {1}" -f $id, $map[$id]
}