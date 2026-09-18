"""
API del bot RPA — la cola, los horarios y la bitácora.

Dos públicos distintos, con permisos distintos:

  `/api/bot/...`          lo que consume la aplicación web: encolar trabajo,
                          mirar qué pasó, gobernar los horarios.

  `/api/bot/runner/...`   lo que consume el proceso del bot. Protegido con un
                          token compartido, porque es lo único capaz de
                          declarar «esta unidad quedó registrada».

El bot NO abre la base de datos por su cuenta: pasa por aquí. Así hay un
único dueño de los datos, y el día que el bot se mude a otra máquina no hay
que cambiar nada del esquema.

Solo se usan GET y POST (nada de PATCH ni DELETE) porque el CORS del
servicio está abierto únicamente a esos dos verbos, y porque es el estilo
del resto de esta API.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Path as ParamRuta, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import bot_db
from .config import get_settings

log = logging.getLogger("abastecimiento.bot_api")

router = APIRouter(prefix="/api/bot", tags=["bot"])


# ══════════════════════════════════════════════════════════════════
# Autenticación del worker
# ══════════════════════════════════════════════════════════════════


def _exigir_token(token: str | None) -> None:
    """Solo el proceso del bot puede tocar los endpoints de `/runner`.

    Si no hay token configurado se rechaza todo, en vez de dejar la puerta
    abierta: un endpoint que declara trabajo como completado no debe quedar
    accesible por descuido.
    """
    esperado = get_settings().bot_token
    if not esperado:
        raise HTTPException(
            status_code=503,
            detail=(
                "El bot no está configurado: falta BOT_TOKEN en el archivo .env "
                "de la raíz del proyecto. Hasta entonces, el worker no puede "
                "reportar nada."
            ),
        )
    if token != esperado:
        raise HTTPException(status_code=401, detail="Token del bot inválido.")


def _tarea(clave: str) -> dict[str, Any]:
    tarea = bot_db.tarea_por_clave(clave)
    if tarea is None:
        raise HTTPException(status_code=404, detail=f"No existe la tarea '{clave}'.")
    return tarea


# ══════════════════════════════════════════════════════════════════
# Cuerpos de petición
# ══════════════════════════════════════════════════════════════════


class UnidadTrabajo(BaseModel):
    """Una unidad: lo que el bot procesa de principio a fin sin interrupción.

    `payload` queda congelado tal cual llega. Es lo que la persona vio y
    aprobó al pulsar el botón, no lo que el cálculo de origen diga cuando
    al bot le toque el turno tres horas después.
    """

    clave: str = Field(..., min_length=1, max_length=120)
    etiqueta: str = ""
    valor: float = 0
    n_detalles: int = 0
    payload: dict[str, Any] = Field(default_factory=dict)


class PeticionEncolar(BaseModel):
    tarea: str = "oc_netcomercial"
    unidades: list[UnidadTrabajo] = Field(..., min_length=1)
    solicitado_por: str = ""
    nota: str = ""
    origen: str = "plan-ordenes"
    parametros: dict[str, Any] = Field(default_factory=dict)


class PeticionHorario(BaseModel):
    tarea: str = "oc_netcomercial"
    nombre: str = Field(..., min_length=1, max_length=80)
    hora: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    dias: str = "1,2,3,4,5"
    activo: bool = True
    aviso_segundos: int = Field(60, ge=0, le=900)
    max_items: int | None = Field(None, ge=1, le=500)


class CambioHorario(BaseModel):
    nombre: str | None = None
    hora: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    dias: str | None = None
    activo: bool | None = None
    aviso_segundos: int | None = Field(None, ge=0, le=900)
    max_items: int | None = Field(None, ge=1, le=500)


class PeticionControl(BaseModel):
    accion: str
    item_id: int | None = None
    minutos: int | None = Field(None, ge=1, le=240)


class PeticionReclamar(BaseModel):
    tarea: str = "oc_netcomercial"
    disparo: str = "manual"
    horario_id: int | None = None
    max_items: int | None = None
    pid: int | None = None


class PeticionProgreso(BaseModel):
    paso_actual: str = ""
    progreso: int | None = Field(None, ge=0, le=100)
    estado: str | None = None


class PeticionEvento(BaseModel):
    nivel: str = "info"
    paso: str = ""
    mensaje: str = ""
    item_id: int | None = None
    captura: str = ""
    detalle: str = ""


class PeticionResultado(BaseModel):
    estado: str
    resultado: str = ""
    error: str = ""


class PeticionFinalizar(BaseModel):
    estado: str = "completada"
    error: str = ""


_DIAS_VALIDOS = re.compile(r"^[1-7](,[1-7])*$")


def _validar_dias(dias: str) -> str:
    limpio = ",".join(sorted(set(d.strip() for d in dias.split(",") if d.strip())))
    if not _DIAS_VALIDOS.match(limpio):
        raise HTTPException(
            status_code=422,
            detail="Los días deben ser números del 1 (lunes) al 7 (domingo), "
                   "separados por comas. Ejemplo: 1,2,3,4,5",
        )
    return limpio


# ══════════════════════════════════════════════════════════════════
# Para la aplicación web
# ══════════════════════════════════════════════════════════════════


@router.get("/estado", summary="Estado general del bot")
def estado() -> dict[str, Any]:
    ajustes = get_settings()
    bot_db.cerrar_ejecuciones_zombis(ajustes.bot_latido_minutos)
    datos = bot_db.resumen()
    datos["tareas"] = bot_db.tareas()
    datos["horarios"] = bot_db.horarios()
    datos["configurado"] = bool(ajustes.bot_token)
    return datos


@router.post("/encolar", summary="Mandar unidades de trabajo a la cola del bot")
def encolar(peticion: PeticionEncolar) -> dict[str, Any]:
    """Congela un envío y lo deja esperando a que al bot le toque el turno.

    Rechaza las unidades cuya clave ya está en vuelo: sin esa guarda, un
    doble clic en el botón dejaría el mismo trabajo dos veces en la cola, y
    lo que el bot escribe en la aplicación de destino no se deshace desde
    aquí.
    """
    tarea = _tarea(peticion.tarea)

    en_vuelo = bot_db.claves_en_vuelo(tarea["id"])
    aceptadas, rechazadas = [], []
    vistas: set[str] = set()
    for u in peticion.unidades:
        clave = u.clave.strip()
        if clave in en_vuelo or clave in vistas:
            rechazadas.append({"clave": clave, "etiqueta": u.etiqueta,
                               "motivo": "ya está en la cola del bot"})
            continue
        vistas.add(clave)
        aceptadas.append({
            "clave": clave,
            "etiqueta": u.etiqueta or clave,
            "valor": u.valor,
            "n_detalles": u.n_detalles or len(u.payload.get("lineas") or []),
            **u.payload,
        })

    if not aceptadas:
        raise HTTPException(
            status_code=409,
            detail="Todas las unidades enviadas ya estaban en la cola del bot. "
                   "No se encoló nada para evitar duplicarlas.",
        )

    resultado = bot_db.crear_lote(
        tarea["id"], aceptadas,
        solicitado_por=peticion.solicitado_por,
        parametros=peticion.parametros,
        nota=peticion.nota,
        origen=peticion.origen,
    )
    log.info(
        "Lote %s encolado por %s: %s aceptadas, %s rechazadas por duplicado",
        resultado["lote_id"], peticion.solicitado_por or "anónimo",
        resultado["aceptadas"], len(rechazadas),
    )
    return {**resultado, "rechazadas": rechazadas,
            "pendientes_totales": bot_db.contar_pendientes(tarea["id"])}


@router.get("/lotes", summary="Historial de envíos a la cola")
def listar_lotes(
    estado: str = Query("", description="Filtrar por estado del lote"),
    limite: int = Query(50, ge=1, le=300),
) -> dict[str, Any]:
    return {"lotes": bot_db.lotes(estado, limite)}


@router.get("/lote/{lote_id}/items", summary="Las unidades de un envío")
def items_lote(lote_id: int = ParamRuta(..., ge=1)) -> dict[str, Any]:
    items = bot_db.items_de_lote(lote_id)
    if not items:
        raise HTTPException(status_code=404, detail=f"El lote {lote_id} no tiene unidades.")
    return {"items": items}


@router.post("/lote/{lote_id}/cancelar", summary="Cancelar lo que aún no se ejecutó")
def cancelar_lote(lote_id: int = ParamRuta(..., ge=1)) -> dict[str, Any]:
    """Cancela solo lo pendiente. Lo ya ejecutado en la aplicación de destino
    no se toca desde aquí: eso se deshace en la aplicación, a mano."""
    cancelados = bot_db.cancelar_lote(lote_id)
    return {"lote_id": lote_id, "cancelados": cancelados}


@router.post("/item/{item_id}/reintentar", summary="Reencolar una unidad fallida")
def reintentar(item_id: int = ParamRuta(..., ge=1)) -> dict[str, Any]:
    bot_db.reintentar_item(item_id)
    return {"item_id": item_id, "estado": "pendiente"}


@router.get("/ejecuciones", summary="Historial de corridas del bot")
def listar_ejecuciones(limite: int = Query(30, ge=1, le=200)) -> dict[str, Any]:
    return {"ejecuciones": bot_db.ejecuciones(limite)}


@router.get("/ejecucion/{ejecucion_id}", summary="Una corrida en detalle")
def ver_ejecucion(ejecucion_id: int = ParamRuta(..., ge=1)) -> dict[str, Any]:
    datos = bot_db.ejecucion(ejecucion_id)
    if datos is None:
        raise HTTPException(status_code=404, detail=f"No existe la corrida {ejecucion_id}.")
    return datos


@router.get("/ejecucion/{ejecucion_id}/eventos", summary="La bitácora de una corrida")
def ver_eventos(
    ejecucion_id: int = ParamRuta(..., ge=1),
    solo_errores: bool = Query(False),
    limite: int = Query(500, ge=1, le=5000),
) -> dict[str, Any]:
    return {"eventos": bot_db.eventos(ejecucion_id, solo_errores, limite)}


@router.post("/ejecucion/{ejecucion_id}/control", summary="Gobernar una corrida en marcha")
def controlar(
    peticion: PeticionControl,
    ejecucion_id: int = ParamRuta(..., ge=1),
) -> dict[str, Any]:
    if peticion.accion not in bot_db.ACCIONES:
        raise HTTPException(
            status_code=422,
            detail=f"Acción desconocida. Válidas: {', '.join(sorted(bot_db.ACCIONES))}",
        )
    if bot_db.ejecucion(ejecucion_id) is None:
        raise HTTPException(status_code=404, detail=f"No existe la corrida {ejecucion_id}.")
    control_id = bot_db.encolar_control(
        ejecucion_id, peticion.accion, peticion.item_id, peticion.minutos
    )
    return {"control_id": control_id, "accion": peticion.accion,
            "nota": "El bot la atenderá al terminar la unidad que tiene entre manos."}


@router.get("/captura/{nombre}", summary="La captura de pantalla de un error")
def captura(nombre: str = ParamRuta(..., max_length=200)) -> FileResponse:
    """Sirve un PNG de la carpeta de capturas del bot.

    Se acepta únicamente un nombre de archivo plano. Cualquier cosa con
    separadores o con `..` se rechaza antes de tocar el disco: esta ruta no
    debe convertirse en una forma de leer archivos arbitrarios del servidor.
    """
    if not re.fullmatch(r"[A-Za-z0-9._-]+\.(png|jpg|jpeg)", nombre):
        raise HTTPException(status_code=400, detail="Nombre de captura no válido.")

    carpeta = get_settings().ruta_capturas_bot.resolve()
    ruta = (carpeta / nombre).resolve()
    if not ruta.is_file() or carpeta not in ruta.parents:
        raise HTTPException(status_code=404, detail="Esa captura ya no está en disco.")
    return FileResponse(ruta, media_type="image/png")


# ── Horarios ──────────────────────────────────────────────────────


@router.get("/horarios", summary="Los horarios configurados")
def listar_horarios(solo_activos: bool = Query(False)) -> dict[str, Any]:
    return {"horarios": bot_db.horarios(solo_activos)}


@router.post("/horarios", summary="Crear un horario")
def crear_horario(peticion: PeticionHorario) -> dict[str, Any]:
    tarea = _tarea(peticion.tarea)
    horario_id = bot_db.crear_horario(
        tarea["id"], peticion.nombre, peticion.hora, _validar_dias(peticion.dias),
        peticion.aviso_segundos, peticion.max_items, peticion.activo,
    )
    return {"horario_id": horario_id}


@router.post("/horarios/{horario_id}/actualizar", summary="Editar un horario")
def actualizar_horario(
    cambios: CambioHorario,
    horario_id: int = ParamRuta(..., ge=1),
) -> dict[str, Any]:
    campos = cambios.model_dump(exclude_none=True)
    if "dias" in campos:
        campos["dias"] = _validar_dias(campos["dias"])
    if not campos:
        raise HTTPException(status_code=422, detail="No se envió ningún cambio.")
    if not bot_db.actualizar_horario(horario_id, campos):
        raise HTTPException(status_code=404, detail=f"No existe el horario {horario_id}.")
    return {"horario_id": horario_id, "cambios": list(campos)}


@router.post("/horarios/{horario_id}/eliminar", summary="Borrar un horario")
def eliminar_horario(horario_id: int = ParamRuta(..., ge=1)) -> dict[str, Any]:
    bot_db.borrar_horario(horario_id)
    return {"horario_id": horario_id, "eliminado": True}


# ══════════════════════════════════════════════════════════════════
# Para el proceso del bot
# ══════════════════════════════════════════════════════════════════


@router.post("/runner/reclamar", summary="[bot] Tomar el candado y recibir trabajo")
def reclamar(
    peticion: PeticionReclamar,
    x_bot_token: str | None = Header(None, alias="X-Bot-Token"),
) -> dict[str, Any]:
    """Abre una corrida y entrega las unidades pendientes.

    Aquí vive **el candado**: solo hay un mouse y un teclado en la máquina,
    así que dos corridas simultáneas no se estorbarían, se destrozarían el
    trabajo mutuamente dentro de la aplicación de destino. Si ya hay una
    viva, esta petición se rechaza y el bot que la pidió espera su turno.
    """
    _exigir_token(x_bot_token)
    ajustes = get_settings()
    tarea = _tarea(peticion.tarea)

    bot_db.cerrar_ejecuciones_zombis(ajustes.bot_latido_minutos)
    viva = bot_db.hay_ejecucion_viva()
    if viva is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Ya hay una corrida en marcha ({viva['job_id']}, estado "
                   f"'{viva['estado']}'). Solo puede correr un bot a la vez.",
        )

    tope = min(peticion.max_items or ajustes.bot_max_items_corrida,
               ajustes.bot_max_items_corrida)
    unidades = bot_db.items_pendientes(tarea["id"], tope)
    if not unidades:
        return {"hay_trabajo": False, "ejecucion_id": None, "unidades": []}

    job_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    ejecucion_id = bot_db.crear_ejecucion(
        job_id, tarea["id"], peticion.disparo, peticion.horario_id,
        total=len(unidades), pid=peticion.pid,
    )
    bot_db.actualizar_ejecucion(ejecucion_id, {
        "estado": "corriendo", "inicio": bot_db.ahora(),
        "paso_actual": "Corrida iniciada",
    })
    bot_db.registrar_evento(
        ejecucion_id, paso="inicio",
        mensaje=f"Corrida {job_id} con {len(unidades)} unidad(es) por procesar "
                f"(disparo: {peticion.disparo}).",
    )
    for u in unidades:
        bot_db.marcar_item(u["id"], "en_proceso", ejecucion_id=ejecucion_id)

    return {
        "hay_trabajo": True,
        "ejecucion_id": ejecucion_id,
        "job_id": job_id,
        "estrategia": tarea["estrategia"],
        "unidades": unidades,
    }


@router.post("/runner/ejecucion/{ejecucion_id}/progreso", summary="[bot] Reportar avance")
def progreso(
    peticion: PeticionProgreso,
    ejecucion_id: int = ParamRuta(..., ge=1),
    x_bot_token: str | None = Header(None, alias="X-Bot-Token"),
) -> dict[str, Any]:
    """Además de mover la barra, cada llamada renueva el latido.

    Sin latido, una corrida que muere en seco dejaría el candado tomado
    para siempre y ninguna corrida futura podría arrancar.
    """
    _exigir_token(x_bot_token)
    bot_db.actualizar_ejecucion(ejecucion_id, peticion.model_dump(exclude_none=True))
    return {"ok": True}


@router.post("/runner/ejecucion/{ejecucion_id}/evento", summary="[bot] Anotar en la bitácora")
def evento(
    peticion: PeticionEvento,
    ejecucion_id: int = ParamRuta(..., ge=1),
    x_bot_token: str | None = Header(None, alias="X-Bot-Token"),
) -> dict[str, Any]:
    _exigir_token(x_bot_token)
    evento_id = bot_db.registrar_evento(ejecucion_id, **peticion.model_dump())
    bot_db.actualizar_ejecucion(ejecucion_id, {"latido": bot_db.ahora()})
    return {"evento_id": evento_id}


@router.post("/runner/item/{item_id}/resultado", summary="[bot] Cerrar una unidad")
def resultado_item(
    peticion: PeticionResultado,
    item_id: int = ParamRuta(..., ge=1),
    x_bot_token: str | None = Header(None, alias="X-Bot-Token"),
) -> dict[str, Any]:
    _exigir_token(x_bot_token)
    validos = {"completado", "fallido", "saltado", "pendiente"}
    if peticion.estado not in validos:
        raise HTTPException(
            status_code=422,
            detail=f"Estado no válido. Válidos: {', '.join(sorted(validos))}",
        )
    bot_db.marcar_item(
        item_id, peticion.estado,
        resultado=peticion.resultado, error=peticion.error, sumar_intento=True,
    )
    return {"item_id": item_id, "estado": peticion.estado}


@router.get("/runner/ejecucion/{ejecucion_id}/control", summary="[bot] ¿Hay alguna orden?")
def leer_control(
    ejecucion_id: int = ParamRuta(..., ge=1),
    x_bot_token: str | None = Header(None, alias="X-Bot-Token"),
) -> dict[str, Any]:
    """Entrega la orden pendiente más antigua y la marca consumida."""
    _exigir_token(x_bot_token)
    bot_db.actualizar_ejecucion(ejecucion_id, {"latido": bot_db.ahora()})
    return {"control": bot_db.tomar_control(ejecucion_id)}


@router.post("/runner/ejecucion/{ejecucion_id}/finalizar", summary="[bot] Cerrar la corrida")
def finalizar(
    peticion: PeticionFinalizar,
    ejecucion_id: int = ParamRuta(..., ge=1),
    x_bot_token: str | None = Header(None, alias="X-Bot-Token"),
) -> dict[str, Any]:
    """Cierra la corrida y **libera el candado**.

    Lo que quedó en 'en_proceso' vuelve a 'pendiente': si la corrida se
    cortó a la mitad, esas unidades no se pierden — las toma la siguiente.
    """
    _exigir_token(x_bot_token)
    bot_db.ejecutar(
        "UPDATE item SET estado = 'pendiente', actualizado = ? "
        "WHERE ejecucion_id = ? AND estado = 'en_proceso'",
        (bot_db.ahora(), ejecucion_id),
    )
    bot_db.actualizar_ejecucion(ejecucion_id, {
        "estado": peticion.estado,
        "fin": bot_db.ahora(),
        "error": peticion.error,
        "paso_actual": "Terminada" if peticion.estado == "completada" else "Terminada con fallos",
    })
    bot_db.registrar_evento(
        ejecucion_id,
        nivel="error" if peticion.estado != "completada" else "info",
        paso="fin",
        mensaje=peticion.error or "Corrida terminada.",
    )
    return {"ejecucion_id": ejecucion_id, "estado": peticion.estado}
