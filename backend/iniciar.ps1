<#
    Arranca el backend de Abastecimiento.

        .\iniciar.ps1              modo normal
        .\iniciar.ps1 -Recargar    recarga al guardar cambios (desarrollo)
        .\iniciar.ps1 -Verificar   solo comprueba la conexión y sale

    La configuración (servidor, usuario, puerto) sale del archivo .env de
    la raíz del proyecto. No hay que definir variables de entorno.
#>
param(
    [switch]$Recargar,
    [switch]$Verificar
)

$ErrorActionPreference = 'Stop'
$raizBackend = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $raizBackend '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Host 'No existe el entorno virtual. Creándolo...' -ForegroundColor Yellow
    python -m venv (Join-Path $raizBackend '.venv')
    & $python -m pip install --upgrade pip
    & $python -m pip install -r (Join-Path $raizBackend 'requirements.txt')
}

$env:PYTHONIOENCODING = 'utf-8'
Set-Location $raizBackend

if ($Verificar) {
    & $python verificar.py
    exit $LASTEXITCODE
}

# Puerto y host se leen del .env para no repetir la configuración aquí.
$envPath = Join-Path (Split-Path -Parent $raizBackend) '.env'
$puerto = '8100'
$host_ = '127.0.0.1'
if (Test-Path $envPath) {
    foreach ($linea in Get-Content $envPath) {
        if ($linea -match '^\s*API_PORT\s*=\s*(.+?)\s*$') { $puerto = $Matches[1] }
        if ($linea -match '^\s*API_HOST\s*=\s*(.+?)\s*$') { $host_ = $Matches[1] }
    }
}

Write-Host ''
Write-Host "  Abastecimiento — backend de solo lectura" -ForegroundColor Cyan
Write-Host "  API .............. http://$host_`:$puerto/api" -ForegroundColor Gray
Write-Host "  Documentación .... http://$host_`:$puerto/docs" -ForegroundColor Gray
Write-Host "  Estado ........... http://$host_`:$puerto/api/salud" -ForegroundColor Gray
Write-Host ''

$argumentos = @('-m', 'uvicorn', 'app.main:app', '--host', $host_, '--port', $puerto)
if ($Recargar) { $argumentos += '--reload' }

& $python @argumentos
