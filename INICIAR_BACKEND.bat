@echo off
REM ====================================================================
REM  Arranca el servicio de Abastecimiento.
REM
REM  Doble clic aqui y dejar esta ventana ABIERTA mientras se usa la
REM  plataforma. Al cerrarla, el servicio se detiene y la pantalla
REM  "Plan de Abastecimiento" deja de cargar.
REM
REM  Para que arranque solo con Windows: Win+R -> shell:startup
REM  y copiar un acceso directo a este archivo en esa carpeta.
REM ====================================================================
title Abastecimiento - servicio de datos (NO CERRAR)
cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
    echo.
    echo  No existe el entorno virtual. Creandolo, esto tarda un momento...
    echo.
    python -m venv .venv
    .venv\Scripts\python.exe -m pip install --upgrade pip
    .venv\Scripts\python.exe -m pip install -r requirements.txt
)

set PYTHONIOENCODING=utf-8

echo.
echo  ==================================================================
echo   ABASTECIMIENTO - servicio de datos
echo  ==================================================================
echo.
echo   Estado      http://127.0.0.1:8100/api/salud
echo   Plataforma  http://127.0.0.1:5173
echo.
echo   Dejar esta ventana abierta. Para detener: Ctrl+C o cerrarla.
echo  ==================================================================
echo.

.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8100

echo.
echo  El servicio se detuvo. Pulsa una tecla para cerrar.
pause > nul
