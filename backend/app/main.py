"""
Punto de entrada del backend de Abastecimiento.

    python -m uvicorn app.main:app --reload    (desde la carpeta backend/)

Documentación interactiva en  http://127.0.0.1:8100/docs
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .bot_api import router as router_bot
from .config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("abastecimiento")

ajustes = get_settings()


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    log.info("Configuración leída de: %s", ajustes.resumen_seguro()["archivo_env"])
    log.info(
        "Base de datos: %s/%s como '%s' (solo lectura: %s)",
        ajustes.db_host,
        ajustes.db_name,
        ajustes.db_user,
        ajustes.db_solo_lectura,
    )
    if not ajustes.db_solo_lectura:
        log.warning(
            "DB_SOLO_LECTURA está en false. El guardián de escritura está "
            "DESACTIVADO. Vuelve a ponerlo en true en el .env."
        )
    yield


app = FastAPI(
    title="Abastecimiento — API de lectura",
    version="1.0.0",
    lifespan=ciclo_de_vida,
    description=(
        "Consolidación de requerimientos de almacén y plan de compra, leídos "
        "del ERP NetComercial (DBF de FoxPro a través del servidor vinculado "
        "de SQL Server).\n\n"
        "**Este servicio es de solo lectura.** No expone ninguna operación de "
        "escritura y rechaza por código cualquier sentencia que no sea SELECT."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ajustes.lista_cors,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(router_bot)


@app.get("/", include_in_schema=False)
def raiz() -> dict[str, str]:
    return {
        "servicio": "abastecimiento-backend",
        "documentacion": "/docs",
        "salud": "/api/salud",
    }
