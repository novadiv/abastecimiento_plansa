"""
Configuración del bot.

DE DÓNDE SALEN LOS VALORES
--------------------------
De dos archivos `.env`, en este orden:

  1. `BotRpaNetcomercial/.env` — lo propio del bot: las credenciales con las
     que abre la sesión remota y hace login en la aplicación.
  2. `<raíz del proyecto>/.env` — lo que el bot comparte con el backend:
     la URL de la API y el token del worker.

Leer el de la raíz evita el problema más tonto y más frecuente de todos:
que alguien cambie `BOT_TOKEN` en un archivo y no en el otro, y el bot se
pase la noche recibiendo 401 sin que nadie se entere. Hay un solo token, en
un solo sitio.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

_BASE_DIR = Path(__file__).resolve().parent.parent.parent   # BotRpaNetcomercial/
_RAIZ_PROYECTO = _BASE_DIR.parent                            # la raíz del repo

load_dotenv(_BASE_DIR / ".env")
load_dotenv(_RAIZ_PROYECTO / ".env", override=False)  # no pisa lo propio del bot

# ============================
# API de la aplicación web. El bot no abre la base de datos: le pregunta
# a la API qué hacer y le reporta lo que pasó.
# ============================
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8100")
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
BOT_TAREA = os.getenv("BOT_TAREA", "oc_netcomercial")
API_TIMEOUT = int(os.getenv("API_TIMEOUT", "20"))

# ============================
# Credenciales de la sesión RDP / de la aplicación a automatizar.
# NUNCA pongas valores reales como default aquí — solo en tu .env local
# (que no se sube a git). Los defaults deben quedar vacíos.
# ============================
USUARIO = os.getenv("APP_USUARIO", "")
PASSWORD = os.getenv("APP_PASSWORD", "")

# ============================
# Comportamiento de las corridas
# ============================
AVISO_SEGUNDOS = int(os.getenv("BOT_AVISO_SEGUNDOS", "60"))
MINUTOS_POSPONER = int(os.getenv("BOT_MINUTOS_POSPONER", "15"))
# Cada cuánto el runner vuelve a preguntarle a la API por los horarios, para
# que un cambio hecho desde la web no exija reiniciar el proceso.
RECARGA_HORARIOS_MINUTOS = int(os.getenv("BOT_RECARGA_HORARIOS_MINUTOS", "5"))

# ============================
# Carpetas
#
# Absolutas a propósito: el runner puede arrancarlo el Programador de tareas
# de Windows desde cualquier directorio, y una ruta relativa dejaría las
# capturas de los errores tiradas en un sitio que nadie encuentra.
# ============================
CARPETA_IMAGENES = str(_BASE_DIR / "imagenes")
CARPETA_SCREENSHOTS = str(_BASE_DIR / "screenshots")
CARPETA_JOBS = str(_BASE_DIR / "jobs")
CARPETA_DATA = str(_BASE_DIR / "data")
CARPETA_LOGS = str(_BASE_DIR / "logs")

# ============================
# Reintentos
# ============================
MAX_REINTENTOS_REGISTRO = int(os.getenv("BOT_MAX_REINTENTOS", "2"))

# ============================
# Coordenadas comunes (RDP + login de la aplicación).
#
# Vacío a propósito. Las coordenadas reales NO se escriben aquí a mano: se
# mapean con `mapear.py` y viven en `data/coordenadas/*.json`, con su huella
# de pantalla y su ancla. Este diccionario queda solo por compatibilidad con
# el esqueleto original y como sitio para un ajuste de emergencia.
#
# Para cargarlas:   perfiles.cargar("escritorio_rdp").como_diccionario()
# ============================
COORDENADAS_COMUNES: dict[str, tuple[int, int]] = {}

# Asegurar carpetas
for _d in [CARPETA_IMAGENES, CARPETA_SCREENSHOTS, CARPETA_JOBS, CARPETA_DATA, CARPETA_LOGS]:
    os.makedirs(_d, exist_ok=True)
