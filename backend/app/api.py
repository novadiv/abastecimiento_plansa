"""Endpoints HTTP del módulo de abastecimiento. Todos son de lectura."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field

from . import cache, compradores, queries, service
from .config import get_settings
from .db import ErrorBaseDatos, SentenciaNoPermitida, probar_conexion
from .vfp import ValorInvalido

log = logging.getLogger("abastecimiento.api")
router = APIRouter(prefix="/api")


def _rango(desde: date | None, hasta: date | None) -> tuple[date, date]:
    """Rango por defecto: del 1 de enero del año en curso hasta hoy."""
    fin = hasta or date.today()
    inicio = desde or date(fin.year, 1, 1)
    if inicio > fin:
        raise HTTPException(400, "La fecha inicial no puede ser posterior a la final.")
    if (fin - inicio) > timedelta(days=366 * 5):
        raise HTTPException(400, "El rango no puede superar 5 años.")
    return inicio, fin


def _ejecutar(operacion, *args: Any, **kwargs: Any) -> Any:
    """Traduce los errores del dominio a respuestas HTTP entendibles."""
    try:
        return operacion(*args, **kwargs)
    except ValorInvalido as exc:
        raise HTTPException(400, str(exc)) from exc
    except SentenciaNoPermitida as exc:
        log.warning("Intento de escritura bloqueado: %s", exc)
        raise HTTPException(403, str(exc)) from exc
    except ErrorBaseDatos as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/salud", summary="Estado de la conexión y de la configuración")
def salud() -> dict[str, Any]:
    ajustes = get_settings()
    informe: dict[str, Any] = {
        "servicio": "abastecimiento-backend",
        "configuracion": ajustes.resumen_seguro(),
        "cache": cache.estado(),
    }
    try:
        informe["conexion"] = probar_conexion()
        informe["estado"] = "ok"
    except (ErrorBaseDatos, SentenciaNoPermitida) as exc:
        informe["estado"] = "sin-conexion"
        informe["error"] = str(exc)
    return informe


@router.get("/catalogos", summary="Valores para los filtros de la pantalla")
def catalogos() -> dict[str, Any]:
    return {
        "areas": _ejecutar(queries.catalogo_areas),
        "almacenes": _ejecutar(queries.catalogo_almacenes),
        "usuarios": _ejecutar(queries.catalogo_usuarios),
        "bases_consumo": [
            {"id": clave, "nombre": etiqueta}
            for clave, etiqueta in service.ETIQUETA_BASE.items()
        ],
        "compradores": _ejecutar(lambda: compradores.maestro()["compradores"]),
    }


@router.get("/consolidado", summary="Requerimientos de almacén consolidados por producto")
def consolidado(
    desde: date | None = Query(None, description="Inicio del periodo (por defecto, 1 de enero)"),
    hasta: date | None = Query(None, description="Fin del periodo (por defecto, hoy)"),
    area: str | None = Query(None, description="Código de área solicitante"),
    usuario: str | None = Query(None, description="Usuario que registró el requerimiento"),
    almacen: str | None = Query(None, description="Almacén de destino"),
    base: Literal["compras", "consumo", "requerimientos", "ordenes"] = Query(
        "compras",
        description="Histórico sobre el que se estima el ritmo mensual de salida",
    ),
    meses: float = Query(
        None, gt=0, le=24, description="Meses de cobertura objetivo (por defecto, los del .env)"
    ),
    solo_por_comprar: bool = Query(False, description="Devolver solo lo que hay que reponer"),
    incluir_pendiente: bool = Query(
        False,
        description="Sumar al pedido el pendiente sin atender, además del consumo previsto",
    ),
    comprador: str | None = Query(
        None,
        description="Ver solo los códigos que compra este usuario de logística",
    ),
) -> dict[str, Any]:
    inicio, fin = _rango(desde, hasta)
    ajustes = get_settings()
    objetivo = meses or float(ajustes.cobertura_meses_defecto)

    clave = (
        f"consolidado:{inicio}:{fin}:{area}:{usuario}:{almacen}:{base}:"
        f"{objetivo}:{solo_por_comprar}:{incluir_pendiente}:{comprador}"
    )
    return _ejecutar(
        cache.obtener_o_calcular,
        clave,
        lambda: service.construir_consolidado(
            desde=inicio,
            hasta=fin,
            area=area,
            usuario=usuario,
            almacen=almacen,
            base_consumo=base,
            meses_cobertura=objetivo,
            solo_por_comprar=solo_por_comprar,
            incluir_pendiente=incluir_pendiente,
            comprador=comprador,
        ),
    )


@router.get(
    "/consolidado/{codigo}/detalle",
    summary="Requerimientos individuales que componen el total de un producto",
)
def detalle_consolidado(
    codigo: str = Path(..., description="Código de producto"),
    desde: date | None = None,
    hasta: date | None = None,
    area: str | None = None,
    usuario: str | None = None,
    almacen: str | None = None,
) -> dict[str, Any]:
    inicio, fin = _rango(desde, hasta)
    clave = f"detalle:{codigo}:{inicio}:{fin}:{area}:{usuario}:{almacen}"
    return _ejecutar(
        cache.obtener_o_calcular,
        clave,
        lambda: service.detalle_de_producto(codigo, inicio, fin, area, usuario, almacen),
    )


@router.get(
    "/producto/{codigo}/historial",
    summary="Serie mensual de compras, consumo y demanda de un producto",
)
def historial_producto(
    codigo: str = Path(..., description="Código de producto"),
    desde: date | None = None,
    hasta: date | None = None,
) -> dict[str, Any]:
    inicio, fin = _rango(desde, hasta)
    clave = f"historial:{codigo}:{inicio}:{fin}"
    return _ejecutar(
        cache.obtener_o_calcular,
        clave,
        lambda: service.historial_de_producto(codigo, inicio, fin),
    )


@router.get(
    "/producto/{codigo}/sustento",
    summary="Demostración aritmética del ritmo mensual y de la cantidad a comprar",
)
def sustento_producto(
    codigo: str = Path(..., description="Código de producto"),
    desde: date | None = None,
    hasta: date | None = None,
    base: Literal["compras", "consumo", "requerimientos", "ordenes"] = "compras",
    meses: float = Query(None, gt=0, le=24),
) -> dict[str, Any]:
    inicio, fin = _rango(desde, hasta)
    objetivo = meses or float(get_settings().cobertura_meses_defecto)
    clave = f"sustento:{codigo}:{inicio}:{fin}:{base}:{objetivo}"
    return _ejecutar(
        cache.obtener_o_calcular,
        clave,
        lambda: service.sustento_de_producto(codigo, inicio, fin, base, objetivo),
    )


@router.get(
    "/producto/{codigo}/ordenes",
    summary="Órdenes de compra del producto, con lo recibido y lo pendiente",
)
def ordenes_producto(
    codigo: str = Path(..., description="Código de producto"),
    desde: date | None = None,
    hasta: date | None = None,
) -> dict[str, Any]:
    inicio, fin = _rango(desde, hasta)
    clave = f"ordenes:{codigo}:{inicio}:{fin}"
    ordenes = _ejecutar(
        cache.obtener_o_calcular,
        clave,
        lambda: queries.ordenes_de_producto(codigo, inicio, fin),
    )
    return {
        "codigo": codigo,
        "ordenes": ordenes,
        "total_ordenado": round(sum(o["cantidad"] for o in ordenes), 3),
        "total_recibido": round(sum(o["recibido"] for o in ordenes), 3),
        "total_pendiente": round(sum(o["pendiente"] for o in ordenes), 3),
    }


@router.get(
    "/plan-ordenes",
    summary="Qué órdenes girar, a qué proveedor y cada cuánto",
)
def plan_ordenes(
    desde: date | None = None,
    hasta: date | None = None,
    base: Literal["compras", "consumo", "requerimientos", "ordenes"] = "compras",
    meses: float = Query(None, gt=0, le=24),
    comprador: str | None = Query(None, description="Ver solo los códigos de este comprador"),
    excluir_tipos: str = Query(
        "",
        description="Tipos de producto a excluir, separados por coma. 07 = materia prima, 14 = aceros",
    ),
    costo_orden: float = Query(45, ge=0, le=10000, description="Costo de emitir una orden, en soles"),
    tasa_almacen: float = Query(
        0.22, gt=0, le=2, description="Tasa anual de almacenaje (0,22 = 22 %)"
    ),
) -> dict[str, Any]:
    inicio, fin = _rango(desde, hasta)
    objetivo = meses or float(get_settings().cobertura_meses_defecto)
    tipos = tuple(sorted({t.strip() for t in excluir_tipos.split(",") if t.strip()}))

    clave = (
        f"plan:{inicio}:{fin}:{base}:{objetivo}:{comprador}:"
        f"{','.join(tipos)}:{costo_orden}:{tasa_almacen}"
    )
    return _ejecutar(
        cache.obtener_o_calcular,
        clave,
        lambda: service.plan_de_ordenes(
            desde=inicio,
            hasta=fin,
            base_consumo=base,
            meses_cobertura=objetivo,
            comprador=comprador,
            excluir_tipos=tipos,
            costo_orden=costo_orden,
            tasa_almacen=tasa_almacen,
        ),
    )


@router.get("/tipos-producto", summary="Tipos de producto, para poder excluirlos del plan")
def tipos_producto() -> dict[str, Any]:
    return {"tipos": _ejecutar(queries.catalogo_tipos_producto)}


@router.get(
    "/producto/{codigo}/proveedores",
    summary="A qué proveedor comprarle, ordenado por precio",
)
def proveedores_producto(
    codigo: str = Path(..., description="Código de producto"),
    desde: date | None = None,
    hasta: date | None = None,
    cantidad: float = Query(
        None, ge=0, description="Cantidad a comprar, para estimar el costo de cada opción"
    ),
) -> dict[str, Any]:
    inicio, fin = _rango(desde, hasta)
    clave = f"proveedores:{codigo}:{inicio}:{fin}:{cantidad}"
    return _ejecutar(
        cache.obtener_o_calcular,
        clave,
        lambda: service.proveedores_de_producto(codigo, inicio, fin, cantidad),
    )


@router.get("/compradores", summary="Reparto interno de códigos entre compradores")
def listar_compradores() -> dict[str, Any]:
    maestro = _ejecutar(compradores.maestro)
    # La asignación completa son miles de códigos: no se devuelve entera.
    return {k: v for k, v in maestro.items() if k != "asignacion"}


@router.get(
    "/compradores/{codigo}",
    summary="Quién compra un código concreto y por qué se le asignó",
)
def comprador_de_codigo(codigo: str = Path(..., description="Código de producto")) -> dict[str, Any]:
    maestro = _ejecutar(compradores.maestro)
    info = maestro["asignacion"].get(codigo)
    if not info:
        return {
            "codigo": codigo,
            "comprador": None,
            "confianza": "sin-datos",
            "motivo": "Este código no tiene ninguna orden de compra en el histórico.",
            "compradores": maestro["compradores"],
        }
    return {"codigo": codigo, **info, "compradores": maestro["compradores"]}


class AsignacionComprador(BaseModel):
    producto_id: str = Field(..., min_length=1, max_length=30)
    comprador: str | None = Field(
        None, max_length=30, description="Vacío o nulo para borrar la asignación manual"
    )


@router.post(
    "/compradores/asignar",
    summary="Corrige a mano quién compra un código (guarda en archivo local)",
)
def asignar_comprador(cuerpo: AsignacionComprador) -> dict[str, Any]:
    """Escribe en el archivo local de asignaciones, NUNCA en el ERP."""
    compradores.asignar_producto(cuerpo.producto_id, cuerpo.comprador)
    return comprador_de_codigo(cuerpo.producto_id)


class Relevo(BaseModel):
    saliente: str = Field(..., min_length=1, max_length=30)
    entrante: str | None = Field(None, max_length=30)


@router.post(
    "/compradores/relevo",
    summary="Traspasa todos los códigos de un comprador que dejó el puesto",
)
def registrar_relevo(cuerpo: Relevo) -> dict[str, Any]:
    compradores.definir_relevo(cuerpo.saliente, cuerpo.entrante)
    maestro = compradores.maestro()
    return {k: v for k, v in maestro.items() if k != "asignacion"}


@router.post("/cache/limpiar", summary="Fuerza la relectura de los datos del ERP")
def limpiar_cache(prefijo: str = Query("", description="Limpiar solo las claves con este prefijo")) -> dict[str, Any]:
    return {"entradas_eliminadas": cache.invalidar(prefijo)}
