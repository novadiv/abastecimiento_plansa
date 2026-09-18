"""
Maestro interno de códigos por comprador.

El problema que resuelve: NetComercial **no sabe a quién va dirigido un
requerimiento de almacén**. Los tres compradores de logística ven la misma
bandeja global. El reparto de códigos entre ellos es un acuerdo interno de
la empresa que no está en ninguna tabla del ERP.

La única huella que ese acuerdo deja en el sistema es **quién emitió la
orden de compra** de cada producto. De ahí se reconstruye el reparto.

Medido sobre las 2.955 referencias con orden en 2026:

    73,3 %  un solo comprador ....................... inequívoco
    17,2 %  varios, pero uno solo sigue activo ...... es un relevo
     4,1 %  varios activos, uno domina (>= 70 %) .... claro
     5,4 %  repartido de verdad entre activos ....... ambiguo

O sea: el 94,6 % se deduce con confianza. El 5,4 % restante, y cualquier
caso en que el histórico no refleje el acuerdo actual, se corrige a mano
desde la pantalla; esas correcciones mandan siempre sobre lo deducido.

Las correcciones se guardan en un JSON junto al `.env`, no en el ERP: esta
aplicación no escribe en la base de producción bajo ninguna circunstancia.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from . import cache, queries
from .config import RAIZ_PROYECTO, get_settings

log = logging.getLogger("abastecimiento.compradores")

ARCHIVO_ASIGNACIONES = RAIZ_PROYECTO / "asignacion_compradores.json"
_candado = threading.Lock()

# Un comprador que no emite órdenes desde hace este tiempo se considera que
# ya no está en el puesto. Sus códigos pasan a quien los haya retomado.
DIAS_PARA_CONSIDERAR_INACTIVO = 60

# Cuentas que aparecen emitiendo órdenes pero no son compradores de
# logística (contabilidad, usuarios puntuales). No se ofrecen como filtro.
CUENTAS_NO_COMPRADORAS = {
    "CONTA01", "CONTA02", "CONTA03", "CONTA04", "CONTA05",
}


# ──────────────────────────────────────────────────────────────────────
#  Correcciones manuales (archivo local)
# ──────────────────────────────────────────────────────────────────────

def _estructura_vacia() -> dict[str, Any]:
    return {
        "version": 1,
        "actualizado": None,
        # producto -> comprador. Manda sobre lo deducido del histórico.
        "asignaciones": {},
        # comprador que dejó el puesto -> quien lo reemplaza. Resuelve de un
        # golpe todos sus códigos huérfanos, sin tener que tocarlos uno a uno.
        "relevos": {},
        # Si está poblado, solo estos aparecen como filtro en la pantalla.
        "compradores_visibles": [],
    }


def leer_asignaciones() -> dict[str, Any]:
    if not ARCHIVO_ASIGNACIONES.exists():
        return _estructura_vacia()
    try:
        with ARCHIVO_ASIGNACIONES.open(encoding="utf-8") as archivo:
            datos = json.load(archivo)
        base = _estructura_vacia()
        base.update({k: v for k, v in datos.items() if k in base})
        return base
    except (OSError, json.JSONDecodeError) as exc:
        log.warning("No se pudo leer %s: %s", ARCHIVO_ASIGNACIONES, exc)
        return _estructura_vacia()


def guardar_asignaciones(datos: dict[str, Any]) -> None:
    """Escribe el archivo local de correcciones. Nunca toca el ERP."""
    datos["actualizado"] = datetime.now().isoformat(timespec="seconds")
    with _candado:
        temporal = ARCHIVO_ASIGNACIONES.with_suffix(".json.tmp")
        with temporal.open("w", encoding="utf-8") as archivo:
            json.dump(datos, archivo, ensure_ascii=False, indent=2)
        temporal.replace(ARCHIVO_ASIGNACIONES)
    cache.invalidar("compradores")


def asignar_producto(producto_id: str, comprador: str | None) -> dict[str, Any]:
    """Fija (o borra, con `None`) el comprador de un código."""
    datos = leer_asignaciones()
    if comprador:
        datos["asignaciones"][producto_id] = comprador.strip().upper()
    else:
        datos["asignaciones"].pop(producto_id, None)
    guardar_asignaciones(datos)
    return datos


def definir_relevo(saliente: str, entrante: str | None) -> dict[str, Any]:
    """Traspasa de una vez todos los códigos de un comprador que ya no está."""
    datos = leer_asignaciones()
    clave = saliente.strip().upper()
    if entrante:
        datos["relevos"][clave] = entrante.strip().upper()
    else:
        datos["relevos"].pop(clave, None)
    guardar_asignaciones(datos)
    return datos


# ──────────────────────────────────────────────────────────────────────
#  Deducción desde el histórico de órdenes
# ──────────────────────────────────────────────────────────────────────

def _deducir(meses_historico: int = 12) -> dict[str, Any]:
    desde = date.today() - timedelta(days=meses_historico * 31)
    filas = queries.compras_por_comprador(desde)
    hoy = date.today()

    # Quién sigue en el puesto, según cuándo emitió su última orden.
    ultima_actividad: dict[str, date] = {}
    for f in filas:
        usuario = (f["usuario_id"] or "").strip().upper()
        fecha = f["ultima"]
        if not usuario or not fecha:
            continue
        if usuario not in ultima_actividad or fecha > ultima_actividad[usuario]:
            ultima_actividad[usuario] = fecha

    activos = {
        u
        for u, fecha in ultima_actividad.items()
        if (hoy - fecha).days <= DIAS_PARA_CONSIDERAR_INACTIVO
    }

    por_producto: dict[str, list[dict[str, Any]]] = {}
    for f in filas:
        usuario = (f["usuario_id"] or "").strip().upper()
        if not usuario or not f["producto_id"]:
            continue
        por_producto.setdefault(f["producto_id"], []).append(
            {
                "usuario": usuario,
                "ordenes": int(f["ordenes"] or 0),
                "unidades": float(f["unidades"] or 0),
                "ultima": f["ultima"],
            }
        )

    deducido: dict[str, dict[str, Any]] = {}
    for producto, registros in por_producto.items():
        candidatos = [r for r in registros if r["usuario"] in activos] or registros
        # Gana el más reciente; a igualdad de fecha, el que más órdenes puso.
        candidatos.sort(key=lambda r: (r["ultima"], r["ordenes"]), reverse=True)
        ganador = candidatos[0]

        if len(registros) == 1:
            confianza, motivo = "alta", "Único comprador del código"
        elif len({r["usuario"] for r in registros if r["usuario"] in activos}) <= 1:
            confianza, motivo = "alta", "Varios en el histórico, pero solo uno sigue activo"
        else:
            total = sum(r["ordenes"] for r in candidatos) or 1
            if ganador["ordenes"] / total >= 0.7:
                confianza, motivo = "media", "Varios activos, pero uno concentra la mayoría"
            else:
                confianza, motivo = "baja", "Repartido entre varios compradores activos"

        deducido[producto] = {
            "comprador": ganador["usuario"],
            "confianza": confianza,
            "motivo": motivo,
            "ordenes": ganador["ordenes"],
            "ultima_orden": ganador["ultima"],
            "otros": sorted({r["usuario"] for r in registros} - {ganador["usuario"]}),
        }

    return {
        "asignacion": deducido,
        "activos": sorted(activos - CUENTAS_NO_COMPRADORAS),
        "inactivos": sorted(set(ultima_actividad) - activos - CUENTAS_NO_COMPRADORAS),
        "ultima_actividad": {u: f for u, f in ultima_actividad.items()},
    }


def maestro() -> dict[str, Any]:
    """Asignación final: lo deducido del ERP con las correcciones encima."""

    def calcular() -> dict[str, Any]:
        base = _deducir()
        manual = leer_asignaciones()
        relevos = {k.upper(): v.upper() for k, v in manual.get("relevos", {}).items()}

        final: dict[str, dict[str, Any]] = {}
        for producto, info in base["asignacion"].items():
            comprador = info["comprador"]
            origen = "historico"
            confianza = info["confianza"]

            # 1) Un relevo declarado traspasa los códigos del que se fue.
            if comprador in relevos:
                comprador = relevos[comprador]
                origen = "relevo"
                confianza = "alta"

            # 2) Una asignación manual manda sobre todo lo anterior.
            if producto in manual["asignaciones"]:
                comprador = manual["asignaciones"][producto]
                origen = "manual"
                confianza = "alta"

            final[producto] = {**info, "comprador": comprador, "origen": origen, "confianza": confianza}

        # Códigos asignados a mano que nunca tuvieron orden de compra.
        for producto, comprador in manual["asignaciones"].items():
            if producto not in final:
                final[producto] = {
                    "comprador": comprador.upper(),
                    "confianza": "alta",
                    "motivo": "Asignado manualmente",
                    "origen": "manual",
                    "ordenes": 0,
                    "ultima_orden": None,
                    "otros": [],
                }

        visibles = [c.upper() for c in manual.get("compradores_visibles", [])]
        if not visibles:
            visibles = [c for c in base["activos"] if c not in relevos]

        conteo: dict[str, int] = {}
        for info in final.values():
            conteo[info["comprador"]] = conteo.get(info["comprador"], 0) + 1

        return {
            "asignacion": final,
            "compradores": sorted(visibles),
            "activos": base["activos"],
            "inactivos": base["inactivos"],
            "relevos": relevos,
            "productos_por_comprador": conteo,
            "manuales": len(manual["asignaciones"]),
            "total_asignados": len(final),
            "por_confianza": {
                nivel: sum(1 for i in final.values() if i["confianza"] == nivel)
                for nivel in ("alta", "media", "baja")
            },
        }

    return cache.obtener_o_calcular("compradores:maestro", calcular)


def comprador_de(producto_id: str) -> str | None:
    return maestro()["asignacion"].get(producto_id, {}).get("comprador")
