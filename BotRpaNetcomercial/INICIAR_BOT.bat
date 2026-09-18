@echo off
REM ====================================================================
REM  Programador del bot RPA.
REM
REM  Deja esta ventana abierta: mientras este abierta, el bot respeta
REM  los horarios configurados en la pantalla de Administracion.
REM
REM  El backend (INICIAR_BACKEND.bat) tiene que estar corriendo tambien:
REM  el bot le pregunta a el que hacer.
REM ====================================================================
title Bot RPA - NetComercial
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo.
    echo   No existe el entorno virtual del bot.
    echo   Crealo con:
    echo       python -m venv .venv
    echo       .venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo.
echo   Iniciando el programador del bot...
echo   Para detenerlo: Ctrl+C, o cierra esta ventana.
echo.
".venv\Scripts\python.exe" iniciar_runner.py %*

echo.
echo   El runner se detuvo.
pause
