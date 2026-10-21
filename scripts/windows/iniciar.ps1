# Arranca la API de EduNova y la vuelve a levantar si se cae. Log en backend\server.log
$backend = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path 'backend'
Set-Location $backend
$log = Join-Path $backend 'server.log'
while ($true) {
  if ((Test-Path $log) -and ((Get-Item $log).Length -gt 5MB)) { Move-Item $log "$log.old" -Force }
  node src/server.js *>> $log
  Start-Sleep -Seconds 5
}
