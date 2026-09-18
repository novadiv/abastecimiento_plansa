"""
Base de datos del bot RPA — cola, horarios y bitácora.

QUÉ ES Y QUÉ NO ES
------------------
Esto es SQLite, y es una base **distinta** de la del ERP. `db.py` habla con
SQL Server en modo estrictamente de solo lectura y esa garantía no se toca:
aquí no se importa nada de aquel módulo ni se comparte conexión. Lo que se
guarda en este archivo es trabajo propio de la aplicación — qué tiene
pendiente el bot, a qué hora corre, y qué pasó en cada corrida.

POR QUÉ SQLITE
--------------
Una sola PC, un solo proceso escribiendo a la vez (el bot no puede correr
dos veces en paralelo, porque solo hay un mouse). En ese escenario SQLite
no le debe nada a PostgreSQL, y evita un servicio más que puede no arrancar
justo la mañana en que hacía falta. Se abre en modo WAL para que el backend
pueda leer mientras el bot escribe.

QUIÉN ESCRIBE AQUÍ
------------------
Solo el backend. El bot RPA vive en otro proceso, con otro entorno virtual,
y habla con esta base **a través de la API** (`/api/bot/...`), nunca
abriendo el archivo por su cuenta. Así hay un único dueño de los datos y el
bot podría mudarse mañana a otra máquina sin cambiar nada de esto.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Sequence

from .config import RAIZ_PROYECTO, get_settings

log = logging.getLogger("abastecimiento.bot_db")

_local = threading.local()
_lock_esquema = threading.Lock()
_esquema_listo = False


def ruta_base() -> Path:
    """Dónde vive el archivo .sqlite3."""
    ajustes = get_settings()
    ruta = Path(getattr(ajustes, "bot_db_ruta", "") or (RAIZ_PROYECTO / "datos" / "bot.sqlite3"))
    if not ruta.is_absolute():
        ruta = RAIZ_PROYECTO / ruta
    ruta.parent.mkdir(parents=True, exist_ok=True)
    return ruta


def ahora() -> str:
    """Instante actual en ISO-8601 con zona, que es como se guarda todo."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ══════════════════════════════════════════════════════════════════
# Conexión
# ══════════════════════════════════════════════════════════════════


def _conexion() -> sqlite3.Connection:
    """Una conexión por hilo. FastAPI atiende en varios y SQLite no las comparte."""
    con = getattr(_local, "con", None)
    if con is not None:
        return con
    con = sqlite3.connect(str(ruta_base()), timeout=15.0, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode = WAL")       # lectores y escritor a la vez
    con.execute("PRAGMA synchronous = NORMAL")
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA busy_timeout = 15000")
    _local.con = con
    return con


@contextmanager
def transaccion() -> Iterator[sqlite3.Connection]:
    """Agrupa varias escrituras en una sola transacción, con reversión."""
    con = _conexion()
    con.execute("BEGIN IMMEDIATE")
    try:
        yield con
    except Exception:
        con.execute("ROLLBACK")
        raise
    con.execute("COMMIT")


def consultar(sql: str, parametros: Sequence[Any] = ()) -> list[dict[str, Any]]:
    asegurar_esquema()
    filas = _conexion().execute(sql, parametros).fetchall()
    return [dict(f) for f in filas]


def consultar_uno(sql: str, parametros: Sequence[Any] = ()) -> dict[str, Any] | None:
    filas = consultar(sql, parametros)
    return filas[0] if filas else None


def ejecutar(sql: str, parametros: Sequence[Any] = ()) -> int:
    """Ejecuta una escritura y devuelve el id de la fila insertada."""
    asegurar_esquema()
    cur = _conexion().execute(sql, parametros)
    return int(cur.lastrowid or 0)


# ══════════════════════════════════════════════════════════════════
# Esquema
# ══════════════════════════════════════════════════════════════════

ESQUEMA = """
-- Una tarea automatizable: qué estrategia del bot corre y con qué nombre.
CREATE TABLE IF NOT EXISTS tarea (
    id          INTEGER PRIMARY KEY,
    clave       TEXT    NOT NULL UNIQUE,
    nombre      TEXT    NOT NULL,
    descripcion TEXT    NOT NULL DEFAULT '',
    estrategia  TEXT    NOT NULL,
    activa      INTEGER NOT NULL DEFAULT 1,
    creada      TEXT    NOT NULL
);

-- Cuándo se dispara una tarea. Varias por tarea: 12:30 y 18:30, por ejemplo.
CREATE TABLE IF NOT EXISTS horario (
    id             INTEGER PRIMARY KEY,
    tarea_id       INTEGER NOT NULL REFERENCES tarea(id) ON DELETE CASCADE,
    nombre         TEXT    NOT NULL,
    hora           TEXT    NOT NULL,                     -- 'HH:MM', hora local
    dias           TEXT    NOT NULL DEFAULT '1,2,3,4,5', -- 1=lunes ... 7=domingo
    activo         INTEGER NOT NULL DEFAULT 1,
    aviso_segundos INTEGER NOT NULL DEFAULT 60,
    max_items      INTEGER,                              -- tope por corrida; NULL = sin tope
    creado         TEXT    NOT NULL,
    actualizado    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_horario_tarea ON horario(tarea_id, activo);

-- Un envío desde la web: el trabajo que se mandó al bot de una sola vez.
CREATE TABLE IF NOT EXISTS lote (
    id             INTEGER PRIMARY KEY,
    tarea_id       INTEGER NOT NULL REFERENCES tarea(id),
    origen         TEXT    NOT NULL DEFAULT 'plan-ordenes',
    solicitado_por TEXT    NOT NULL DEFAULT '',
    nota           TEXT    NOT NULL DEFAULT '',
    parametros     TEXT    NOT NULL DEFAULT '{}',  -- JSON: con qué filtros se armó el plan
    estado         TEXT    NOT NULL DEFAULT 'pendiente',
    creado         TEXT    NOT NULL,
    actualizado    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lote_estado ON lote(estado, creado);

-- Una corrida del bot, de principio a fin.
CREATE TABLE IF NOT EXISTS ejecucion (
    id          INTEGER PRIMARY KEY,
    job_id      TEXT    NOT NULL UNIQUE,
    tarea_id    INTEGER NOT NULL REFERENCES tarea(id),
    horario_id  INTEGER REFERENCES horario(id),
    disparo     TEXT    NOT NULL DEFAULT 'manual',   -- horario | manual
    estado      TEXT    NOT NULL DEFAULT 'en_cola',
    paso_actual TEXT    NOT NULL DEFAULT '',
    progreso    INTEGER NOT NULL DEFAULT 0,
    total       INTEGER NOT NULL DEFAULT 0,
    exitosos    INTEGER NOT NULL DEFAULT 0,
    fallidos    INTEGER NOT NULL DEFAULT 0,
    saltados    INTEGER NOT NULL DEFAULT 0,
    inicio      TEXT,
    fin         TEXT,
    error       TEXT    NOT NULL DEFAULT '',
    pid         INTEGER,
    latido      TEXT,                                -- última señal de vida del bot
    creado      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ejecucion_estado ON ejecucion(estado, creado DESC);

-- Una unidad de trabajo: lo que el bot procesa de una sola vez, de principio a fin.
CREATE TABLE IF NOT EXISTS item (
    id           INTEGER PRIMARY KEY,
    lote_id      INTEGER NOT NULL REFERENCES lote(id) ON DELETE CASCADE,
    clave        TEXT    NOT NULL,          -- id propio del proceso: impide duplicar en el lote
    etiqueta     TEXT    NOT NULL,          -- nombre legible de la unidad de trabajo
    n_detalles     INTEGER NOT NULL DEFAULT 0,
    valor        REAL    NOT NULL DEFAULT 0,
    payload      TEXT    NOT NULL,          -- JSON con la orden entera, congelada
    estado       TEXT    NOT NULL DEFAULT 'pendiente',
    intentos     INTEGER NOT NULL DEFAULT 0,
    resultado    TEXT    NOT NULL DEFAULT '',
    error        TEXT    NOT NULL DEFAULT '',
    ejecucion_id INTEGER REFERENCES ejecucion(id),
    creado       TEXT    NOT NULL,
    actualizado  TEXT    NOT NULL,
    UNIQUE (lote_id, clave)
);
CREATE INDEX IF NOT EXISTS ix_item_pendiente ON item(estado, lote_id);

-- La bitácora paso a paso. Es lo que se mira cuando algo falló.
CREATE TABLE IF NOT EXISTS evento (
    id           INTEGER PRIMARY KEY,
    ejecucion_id INTEGER NOT NULL REFERENCES ejecucion(id) ON DELETE CASCADE,
    item_id      INTEGER REFERENCES item(id),
    momento      TEXT    NOT NULL,
    nivel        TEXT    NOT NULL DEFAULT 'info',   -- info | aviso | error
    paso         TEXT    NOT NULL DEFAULT '',
    mensaje      TEXT    NOT NULL DEFAULT '',
    captura      TEXT    NOT NULL DEFAULT '',       -- nombre del PNG, si lo hay
    detalle      TEXT    NOT NULL DEFAULT ''        -- traza del error
);
CREATE INDEX IF NOT EXISTS ix_evento_ejecucion ON evento(ejecucion_id, id);
CREATE INDEX IF NOT EXISTS ix_evento_nivel ON evento(nivel, momento DESC);

-- Órdenes que la web deja para un bot que ya está corriendo.
CREATE TABLE IF NOT EXISTS control (
    id           INTEGER PRIMARY KEY,
    ejecucion_id INTEGER NOT NULL REFERENCES ejecucion(id) ON DELETE CASCADE,
    accion       TEXT    NOT NULL,   -- pausar | reanudar | saltar | detener | posponer
    item_id      INTEGER,
    minutos      INTEGER,
    creado       TEXT    NOT NULL,
    consumido    TEXT
);
CREATE INDEX IF NOT EXISTS ix_control_pendiente ON control(ejecucion_id, consumido);
"""

# Las tareas que existen de fábrica. Se insertan solo si no están.
TAREAS_INICIALES = [
    (
        "oc_netcomercial",
        "Registrar órdenes de compra",
        "Toma las órdenes enviadas desde «Órdenes a girar» y las registra en "
        "NetComercial, una por proveedor.",
        "oc",   # el `code` del @register de la estrategia
    ),
]


def asegurar_esquema() -> None:
    """Crea las tablas la primera vez. Idempotente y barato tras el primer paso."""
    global _esquema_listo
    if _esquema_listo:
        return
    with _lock_esquema:
        if _esquema_listo:
            return
        con = _conexion()
        con.executescript(ESQUEMA)
        for clave, nombre, descripcion, estrategia in TAREAS_INICIALES:
            con.execute(
                "INSERT OR IGNORE INTO tarea (clave, nombre, descripcion, estrategia, creada) "
                "VALUES (?, ?, ?, ?, ?)",
                (clave, nombre, descripcion, estrategia, ahora()),
            )
        _esquema_listo = True
        log.info("Base del bot lista en %s", ruta_base())


# ══════════════════════════════════════════════════════════════════
# Tareas
# ══════════════════════════════════════════════════════════════════


def tareas() -> list[dict[str, Any]]:
    return consultar("SELECT * FROM tarea ORDER BY nombre")


def tarea_por_clave(clave: str) -> dict[str, Any] | None:
    return consultar_uno("SELECT * FROM tarea WHERE clave = ?", (clave,))


# ══════════════════════════════════════════════════════════════════
# Horarios
# ══════════════════════════════════════════════════════════════════


def horarios(solo_activos: bool = False) -> list[dict[str, Any]]:
    sql = (
        "SELECT h.*, t.clave AS tarea_clave, t.nombre AS tarea_nombre, t.activa AS tarea_activa "
        "FROM horario h JOIN tarea t ON t.id = h.tarea_id "
    )
    if solo_activos:
        sql += "WHERE h.activo = 1 AND t.activa = 1 "
    sql += "ORDER BY h.hora, h.nombre"
    return consultar(sql)


def crear_horario(
    tarea_id: int,
    nombre: str,
    hora: str,
    dias: str,
    aviso_segundos: int = 60,
    max_items: int | None = None,
    activo: bool = True,
) -> int:
    t = ahora()
    return ejecutar(
        "INSERT INTO horario (tarea_id, nombre, hora, dias, activo, aviso_segundos, "
        "max_items, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (tarea_id, nombre, hora, dias, 1 if activo else 0, aviso_segundos, max_items, t, t),
    )


def actualizar_horario(horario_id: int, cambios: dict[str, Any]) -> bool:
    permitidos = {"nombre", "hora", "dias", "activo", "aviso_segundos", "max_items"}
    campos = {k: v for k, v in cambios.items() if k in permitidos}
    if not campos:
        return False
    if "activo" in campos:
        campos["activo"] = 1 if campos["activo"] else 0
    campos["actualizado"] = ahora()
    asignaciones = ", ".join(f"{k} = ?" for k in campos)
    ejecutar(
        f"UPDATE horario SET {asignaciones} WHERE id = ?",
        (*campos.values(), horario_id),
    )
    return True


def borrar_horario(horario_id: int) -> None:
    ejecutar("DELETE FROM horario WHERE id = ?", (horario_id,))


# ══════════════════════════════════════════════════════════════════
# Lotes e items
# ══════════════════════════════════════════════════════════════════


def crear_lote(
    tarea_id: int,
    unidades: list[dict[str, Any]],
    solicitado_por: str,
    parametros: dict[str, Any] | None = None,
    nota: str = "",
    origen: str = "plan-ordenes",
) -> dict[str, Any]:
    """Congela un envío: el lote y sus unidades de trabajo, tal como estaban.

    Se guarda el payload ENTERO de cada unidad, no una referencia a lo que
    lo originó. Lo que el bot debe ejecutar es lo que la persona vio y
    aprobó al pulsar el botón, no lo que el cálculo de origen diga cuando
    al bot le toque el turno tres horas después.

    Devuelve el lote con el conteo de unidades aceptadas y de las
    rechazadas por venir duplicadas.
    """
    t = ahora()
    with transaccion() as con:
        cur = con.execute(
            "INSERT INTO lote (tarea_id, origen, solicitado_por, nota, parametros, "
            "estado, creado, actualizado) VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?)",
            (tarea_id, origen, solicitado_por, nota,
             json.dumps(parametros or {}, ensure_ascii=False), t, t),
        )
        lote_id = int(cur.lastrowid or 0)

        aceptadas, duplicadas = 0, 0
        for unidad in unidades:
            # `proveedor_id`/`proveedor` son alias heredados: cualquier proceso
            # nuevo debería mandar `clave` y `etiqueta`.
            clave = str(unidad.get("clave") or unidad.get("proveedor_id") or "").strip()
            if not clave:
                continue
            try:
                con.execute(
                    "INSERT INTO item (lote_id, clave, etiqueta, n_detalles, "
                    "valor, payload, estado, creado, actualizado) "
                    "VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)",
                    (
                        lote_id, clave,
                        str(unidad.get("etiqueta") or unidad.get("proveedor") or clave),
                        int(unidad.get("n_detalles")
                            or len(unidad.get("detalles") or unidad.get("lineas") or [])),
                        float(unidad.get("valor") or unidad.get("importe") or 0),
                        json.dumps(unidad, ensure_ascii=False),
                        t, t,
                    ),
                )
                aceptadas += 1
            except sqlite3.IntegrityError:
                duplicadas += 1

    return {"lote_id": lote_id, "aceptadas": aceptadas, "duplicadas": duplicadas}


def lotes(estado: str = "", limite: int = 50) -> list[dict[str, Any]]:
    sql = (
        "SELECT l.*, t.nombre AS tarea_nombre, "
        "  (SELECT COUNT(*) FROM item i WHERE i.lote_id = l.id) AS items, "
        "  (SELECT COUNT(*) FROM item i WHERE i.lote_id = l.id AND i.estado = 'pendiente') AS pendientes, "
        "  (SELECT COUNT(*) FROM item i WHERE i.lote_id = l.id AND i.estado = 'completado') AS completados, "
        "  (SELECT COUNT(*) FROM item i WHERE i.lote_id = l.id AND i.estado = 'fallido') AS fallidos, "
        "  (SELECT COALESCE(SUM(i.valor), 0) FROM item i WHERE i.lote_id = l.id) AS valor "
        "FROM lote l JOIN tarea t ON t.id = l.tarea_id "
    )
    parametros: list[Any] = []
    if estado:
        sql += "WHERE l.estado = ? "
        parametros.append(estado)
    sql += "ORDER BY l.creado DESC LIMIT ?"
    parametros.append(limite)
    return consultar(sql, parametros)


def items_de_lote(lote_id: int) -> list[dict[str, Any]]:
    return consultar(
        "SELECT id, lote_id, clave, etiqueta, n_detalles, valor, estado, "
        "intentos, resultado, error, ejecucion_id, creado, actualizado "
        "FROM item WHERE lote_id = ? ORDER BY valor DESC",
        (lote_id,),
    )


def items_pendientes(tarea_id: int, limite: int | None = None) -> list[dict[str, Any]]:
    """Lo que le queda por hacer al bot, en orden de llegada.

    Se sirven los lotes más antiguos primero, y dentro de cada lote las
    unidades de mayor valor: si una corrida se corta a medias, lo que
    quedó hecho es lo que más pesaba.
    """
    sql = (
        "SELECT i.*, l.parametros, l.solicitado_por "
        "FROM item i JOIN lote l ON l.id = i.lote_id "
        "WHERE i.estado = 'pendiente' AND l.tarea_id = ? AND l.estado != 'cancelado' "
        "ORDER BY l.creado ASC, i.valor DESC"
    )
    parametros: list[Any] = [tarea_id]
    if limite:
        sql += " LIMIT ?"
        parametros.append(limite)
    return consultar(sql, parametros)


def contar_pendientes(tarea_id: int) -> int:
    fila = consultar_uno(
        "SELECT COUNT(*) AS n FROM item i JOIN lote l ON l.id = i.lote_id "
        "WHERE i.estado = 'pendiente' AND l.tarea_id = ? AND l.estado != 'cancelado'",
        (tarea_id,),
    )
    return int(fila["n"]) if fila else 0


def claves_en_vuelo(tarea_id: int) -> set[str]:
    """Las claves que ya tienen trabajo esperando o en proceso.

    Es la defensa contra el doble clic y contra volver a mandar el mismo
    la misma unidad desde otra pestaña: si todavía no se ha procesado,
    mandarla otra vez la haría ejecutar dos veces. Y lo que el bot escribe
    en la aplicación de destino no se deshace desde aquí.
    """
    filas = consultar(
        "SELECT DISTINCT i.clave FROM item i JOIN lote l ON l.id = i.lote_id "
        "WHERE l.tarea_id = ? AND i.estado IN ('pendiente', 'en_proceso')",
        (tarea_id,),
    )
    return {f["clave"] for f in filas}


def marcar_item(
    item_id: int,
    estado: str,
    *,
    resultado: str = "",
    error: str = "",
    ejecucion_id: int | None = None,
    sumar_intento: bool = False,
) -> None:
    ejecutar(
        "UPDATE item SET estado = ?, resultado = COALESCE(NULLIF(?, ''), resultado), "
        "error = ?, ejecucion_id = COALESCE(?, ejecucion_id), "
        "intentos = intentos + ?, actualizado = ? WHERE id = ?",
        (estado, resultado, error, ejecucion_id, 1 if sumar_intento else 0, ahora(), item_id),
    )
    _refrescar_estado_lote(item_id)


def _refrescar_estado_lote(item_id: int) -> None:
    """Un lote está completo cuando no le queda ninguna orden pendiente."""
    fila = consultar_uno(
        "SELECT l.id, "
        "  SUM(CASE WHEN i.estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes, "
        "  SUM(CASE WHEN i.estado = 'fallido' THEN 1 ELSE 0 END) AS fallidos "
        "FROM lote l JOIN item i ON i.lote_id = l.id "
        "WHERE l.id = (SELECT lote_id FROM item WHERE id = ?) GROUP BY l.id",
        (item_id,),
    )
    if not fila:
        return
    if fila["pendientes"]:
        estado = "en_proceso"
    elif fila["fallidos"]:
        estado = "fallido"
    else:
        estado = "completado"
    ejecutar(
        "UPDATE lote SET estado = ?, actualizado = ? WHERE id = ? AND estado != 'cancelado'",
        (estado, ahora(), fila["id"]),
    )


def cancelar_lote(lote_id: int) -> int:
    """Cancela lo que aún no se ha registrado. Lo ya grabado en el ERP no se toca."""
    t = ahora()
    with transaccion() as con:
        cur = con.execute(
            "UPDATE item SET estado = 'cancelado', actualizado = ? "
            "WHERE lote_id = ? AND estado = 'pendiente'",
            (t, lote_id),
        )
        cancelados = cur.rowcount or 0
        con.execute("UPDATE lote SET estado = 'cancelado', actualizado = ? WHERE id = ?", (t, lote_id))
    return cancelados


def reintentar_item(item_id: int) -> None:
    ejecutar(
        "UPDATE item SET estado = 'pendiente', error = '', actualizado = ? "
        "WHERE id = ? AND estado IN ('fallido', 'saltado', 'cancelado')",
        (ahora(), item_id),
    )
    _refrescar_estado_lote(item_id)


# ══════════════════════════════════════════════════════════════════
# Ejecuciones
# ══════════════════════════════════════════════════════════════════


def hay_ejecucion_viva() -> dict[str, Any] | None:
    """La corrida en marcha, si la hay. Es el candado: solo puede haber una.

    Solo hay un mouse y un teclado en la máquina. Dos bots a la vez no se
    estorbarían: se destrozarían el trabajo mutuamente dentro del ERP.
    """
    return consultar_uno(
        "SELECT e.*, t.nombre AS tarea_nombre FROM ejecucion e JOIN tarea t ON t.id = e.tarea_id "
        "WHERE e.estado IN ('en_cola', 'corriendo', 'pausada') ORDER BY e.creado DESC LIMIT 1"
    )


def crear_ejecucion(
    job_id: str,
    tarea_id: int,
    disparo: str = "manual",
    horario_id: int | None = None,
    total: int = 0,
    pid: int | None = None,
) -> int:
    return ejecutar(
        "INSERT INTO ejecucion (job_id, tarea_id, horario_id, disparo, estado, total, pid, "
        "latido, creado) VALUES (?, ?, ?, ?, 'en_cola', ?, ?, ?, ?)",
        (job_id, tarea_id, horario_id, disparo, total, pid, ahora(), ahora()),
    )


def actualizar_ejecucion(ejecucion_id: int, cambios: dict[str, Any]) -> None:
    permitidos = {
        "estado", "paso_actual", "progreso", "total", "exitosos", "fallidos",
        "saltados", "inicio", "fin", "error", "pid", "latido",
    }
    campos = {k: v for k, v in cambios.items() if k in permitidos}
    if not campos:
        return
    campos.setdefault("latido", ahora())
    asignaciones = ", ".join(f"{k} = ?" for k in campos)
    ejecutar(
        f"UPDATE ejecucion SET {asignaciones} WHERE id = ?",
        (*campos.values(), ejecucion_id),
    )


def ejecucion(ejecucion_id: int) -> dict[str, Any] | None:
    return consultar_uno(
        "SELECT e.*, t.nombre AS tarea_nombre, t.clave AS tarea_clave "
        "FROM ejecucion e JOIN tarea t ON t.id = e.tarea_id WHERE e.id = ?",
        (ejecucion_id,),
    )


def ejecuciones(limite: int = 30) -> list[dict[str, Any]]:
    return consultar(
        "SELECT e.*, t.nombre AS tarea_nombre, "
        "  (SELECT COUNT(*) FROM evento v WHERE v.ejecucion_id = e.id AND v.nivel = 'error') AS errores "
        "FROM ejecucion e JOIN tarea t ON t.id = e.tarea_id "
        "ORDER BY e.creado DESC LIMIT ?",
        (limite,),
    )


def cerrar_ejecuciones_zombis(minutos_sin_latido: int = 15) -> int:
    """Marca como abortada toda corrida que dejó de dar señales de vida.

    Si el bot se cae en seco (se cierra la sesión, se va la luz, alguien
    mata el proceso), su ejecución quedaría 'corriendo' para siempre y el
    candado no dejaría arrancar nunca más. Esto la libera.
    """
    corte = (
        datetime.now(timezone.utc).timestamp() - minutos_sin_latido * 60
    )
    vivas = consultar(
        "SELECT id, job_id, latido FROM ejecucion WHERE estado IN ('en_cola', 'corriendo', 'pausada')"
    )
    cerradas = 0
    for e in vivas:
        try:
            latido = datetime.fromisoformat(e["latido"]).timestamp()
        except (TypeError, ValueError):
            latido = 0
        if latido < corte:
            actualizar_ejecucion(e["id"], {
                "estado": "abortada",
                "fin": ahora(),
                "error": f"Sin señales de vida por más de {minutos_sin_latido} minutos. "
                         "El proceso del bot se cerró sin avisar.",
            })
            registrar_evento(
                e["id"], nivel="error", paso="vigilancia",
                mensaje="La corrida se dio por abortada: el bot dejó de reportar.",
            )
            cerradas += 1
    return cerradas


# ══════════════════════════════════════════════════════════════════
# Bitácora
# ══════════════════════════════════════════════════════════════════


def registrar_evento(
    ejecucion_id: int,
    *,
    nivel: str = "info",
    paso: str = "",
    mensaje: str = "",
    item_id: int | None = None,
    captura: str = "",
    detalle: str = "",
) -> int:
    return ejecutar(
        "INSERT INTO evento (ejecucion_id, item_id, momento, nivel, paso, mensaje, "
        "captura, detalle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (ejecucion_id, item_id, ahora(), nivel, paso, mensaje, captura, detalle),
    )


def eventos(ejecucion_id: int, solo_errores: bool = False, limite: int = 500) -> list[dict[str, Any]]:
    sql = (
        "SELECT v.*, i.etiqueta FROM evento v LEFT JOIN item i ON i.id = v.item_id "
        "WHERE v.ejecucion_id = ? "
    )
    if solo_errores:
        sql += "AND v.nivel = 'error' "
    sql += "ORDER BY v.id ASC LIMIT ?"
    return consultar(sql, (ejecucion_id, limite))


# ══════════════════════════════════════════════════════════════════
# Control externo (pausar, saltar, detener, posponer)
# ══════════════════════════════════════════════════════════════════

ACCIONES = {"pausar", "reanudar", "saltar", "detener", "posponer"}


def encolar_control(
    ejecucion_id: int, accion: str, item_id: int | None = None, minutos: int | None = None
) -> int:
    if accion not in ACCIONES:
        raise ValueError(f"Acción desconocida: {accion}")
    return ejecutar(
        "INSERT INTO control (ejecucion_id, accion, item_id, minutos, creado) VALUES (?, ?, ?, ?, ?)",
        (ejecucion_id, accion, item_id, minutos, ahora()),
    )


def tomar_control(ejecucion_id: int) -> dict[str, Any] | None:
    """Saca la orden pendiente más antigua y la marca consumida. La lee el bot."""
    with transaccion() as con:
        fila = con.execute(
            "SELECT * FROM control WHERE ejecucion_id = ? AND consumido IS NULL "
            "ORDER BY id ASC LIMIT 1",
            (ejecucion_id,),
        ).fetchone()
        if fila is None:
            return None
        con.execute("UPDATE control SET consumido = ? WHERE id = ?", (ahora(), fila["id"]))
    return dict(fila)


# ══════════════════════════════════════════════════════════════════
# Diagnóstico
# ══════════════════════════════════════════════════════════════════


def resumen() -> dict[str, Any]:
    """Lo que necesita la pantalla de Administración para el estado general."""
    asegurar_esquema()
    viva = hay_ejecucion_viva()
    fila = consultar_uno(
        "SELECT "
        " (SELECT COUNT(*) FROM item WHERE estado = 'pendiente') AS pendientes, "
        " (SELECT COALESCE(SUM(valor), 0) FROM item WHERE estado = 'pendiente') AS valor_pendiente, "
        " (SELECT COUNT(*) FROM item WHERE estado = 'fallido') AS fallidos, "
        " (SELECT COUNT(*) FROM horario WHERE activo = 1) AS horarios_activos"
    ) or {}
    ultima = consultar_uno(
        "SELECT e.*, t.nombre AS tarea_nombre FROM ejecucion e JOIN tarea t ON t.id = e.tarea_id "
        "WHERE e.estado IN ('completada', 'fallida', 'abortada') ORDER BY e.creado DESC LIMIT 1"
    )
    return {
        "archivo": str(ruta_base()),
        "ejecucion_viva": viva,
        "ultima_ejecucion": ultima,
        "pendientes": int(fila.get("pendientes") or 0),
        "valor_pendiente": float(fila.get("valor_pendiente") or 0),
        "fallidos": int(fila.get("fallidos") or 0),
        "horarios_activos": int(fila.get("horarios_activos") or 0),
    }
