# Instala y configura EduNova en este PC (Windows). Ejecútalo una sola vez:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\instalar.ps1
$ErrorActionPreference = 'Stop'
$root    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backend = Join-Path $root 'backend'
$utf8    = New-Object System.Text.UTF8Encoding($false)   # UTF-8 sin BOM (dotenv lo exige)

function Test-Cmd($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

# --- Requisitos ---
if (-not (Test-Cmd 'node')) { throw 'Falta Node.js 18 o superior (https://nodejs.org). Instálalo y vuelve a ejecutar este script.' }
$py = $null
foreach ($c in 'python', 'py') {
  if (Test-Cmd $c) {
    & $c --version *> $null
    if ($LASTEXITCODE -eq 0) { $py = $c; break }
  }
}
if (-not $py) { throw 'Falta Python 3.9 o superior (https://www.python.org). Márcalo con "Add python.exe to PATH" al instalarlo.' }

Push-Location $backend
try {
  Write-Host '1/4  Dependencias de Node...' -ForegroundColor Cyan
  npm install --omit=dev
  if ($LASTEXITCODE -ne 0) { throw 'npm install falló.' }

  Write-Host '2/4  Entorno de Python (backend\.venv)...' -ForegroundColor Cyan
  $venvPy = Join-Path $backend '.venv\Scripts\python.exe'
  if (-not (Test-Path $venvPy)) {
    & $py -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el entorno virtual (.venv).' }
  }
  & $venvPy -m pip install --upgrade pip --quiet
  & $venvPy -m pip install -r python\requirements.txt
  if ($LASTEXITCODE -ne 0) { throw 'pip install falló.' }

  Write-Host '3/4  Chromium para los PDF (descarga unos 150 MB)...' -ForegroundColor Cyan
  & $venvPy -m playwright install chromium
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar Chromium.' }

  Write-Host '4/4  Archivo .env...' -ForegroundColor Cyan
  $envFile = Join-Path $backend '.env'
  if (Test-Path $envFile) {
    Write-Host '     Ya existe backend\.env; no se modificó.'
  } else {
    $secret = (node -e "console.log(require('crypto').randomBytes(48).toString('hex'))").Trim()
    $text = [System.IO.File]::ReadAllText((Join-Path $backend '.env.example'), $utf8)
    $text = $text -replace '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$secret"
    $text = $text -replace '(?m)^DB_PORT=.*$', 'DB_PORT=4000'
    $text = $text -replace '(?m)^DB_SSL=.*$', 'DB_SSL=true'
    $text = $text -replace '(?m)^TRUST_PROXY=.*$', 'TRUST_PROXY=true'
    $text = $text -replace '(?m)^ALLOWED_ORIGINS=.*$', 'ALLOWED_ORIGINS=https://ingemartin-dev.github.io'
    [System.IO.File]::WriteAllText($envFile, $text, $utf8)
    Write-Host '     Creado backend\.env con JWT_SECRET, puerto 4000, SSL y CORS ya configurados.'
  }
} finally { Pop-Location }

Write-Host ''
Write-Host 'Listo. Falta solo esto:' -ForegroundColor Green
Write-Host '  1) Abre backend\.env y completa DB_HOST, DB_USER, DB_PASSWORD (datos de TiDB Cloud). DB_NAME=edu_nova.'
Write-Host '  2) Crea las tablas (una sola vez):   cd backend ; npm run db:init'
Write-Host '  3) Arranca el servidor:              powershell -File scripts\windows\iniciar.ps1'
if (Test-Path (Join-Path $backend '.env')) { Start-Process notepad (Join-Path $backend '.env') }
