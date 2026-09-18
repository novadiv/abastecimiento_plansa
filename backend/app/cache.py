"""
Caché en memoria con vencimiento.

El consolidado de un año completo tarda ~15 s contra FoxPro: aceptable una
vez, insufrible en cada clic de un filtro. Se guarda el resultado durante
`CACHE_TTL_SEGUNDOS` (configurable en el .env) para que la pantalla responda
al instante mientras el dato sigue siendo del día.

Es deliberadamente un diccionario en memoria y no Redis: el volumen es de
unos pocos miles de filas y añadir una pieza de infraestructura más al
servidor no se justifica.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Callable, TypeVar

from .config import get_settings

T = TypeVar("T")

_almacen: dict[str, tuple[float, Any]] = {}
_candado = threading.Lock()


def obtener_o_calcular(clave: str, calcular: Callable[[], T], ttl: int | None = None) -> T:
    """Devuelve el valor cacheado de `clave`, o lo calcula y lo guarda."""
    vida = ttl if ttl is not None else get_settings().cache_ttl_segundos
    ahora = time.time()

    with _candado:
        entrada = _almacen.get(clave)
        if entrada and entrada[0] > ahora:
            return entrada[1]

    # El cálculo se hace fuera del candado: una consulta de 15 s no debe
    # bloquear a quien pide otra cosa distinta.
    valor = calcular()

    with _candado:
        _almacen[clave] = (ahora + vida, valor)
    return valor


def invalidar(prefijo: str = "") -> int:
    """Borra las entradas cuya clave empieza por `prefijo` (todas si va vacío)."""
    with _candado:
        claves = [k for k in _almacen if k.startswith(prefijo)]
        for k in claves:
            del _almacen[k]
        return len(claves)


def estado() -> dict[str, Any]:
    ahora = time.time()
    with _candado:
        return {
            "entradas": len(_almacen),
            "vigentes": sum(1 for vence, _ in _almacen.values() if vence > ahora),
            "ttl_segundos": get_settings().cache_ttl_segundos,
        }
