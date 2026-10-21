# Hace que la API arranque sola cada vez que inicias sesión en Windows.
#   powershell -ExecutionPolicy Bypass -File scripts\windows\autoarranque.ps1
# Para quitarlo:  Unregister-ScheduledTask -TaskName "EduNova API" -Confirm:$false
$ErrorActionPreference = 'Stop'
$script   = Join-Path $PSScriptRoot 'iniciar.ps1'
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'EduNova API' -Action $action -Trigger $trigger -Settings $settings -Description 'API de EduNova' -Force | Out-Null
Write-Host 'Listo: "EduNova API" arrancará al iniciar sesión. Para probarlo ya:  Start-ScheduledTask -TaskName "EduNova API"'
