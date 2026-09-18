"""
Acceso a datos — ESTRICTAMENTE SOLO LECTURA.

Tres barreras independientes protegen la base de producción:

  1. El usuario de SQL Server (`plansareader`) tiene permisos de lectura.
  2. `verificar_solo_lectura()` rechaza por código cualquier sentencia que
     no sea un SELECT, antes de enviarla al servidor.
  3. La conexión se abre con autocommit, así nunca queda una transacción
     abierta que pudiera bloquear tablas del ERP en uso.

Si alguien intenta escribir, la petición falla aquí y nunca llega a la red.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from contextlib import contextmanager
from typing import Any, Iterator, Sequence

import pyodbc

from .config import get_settings

log = logging.getLogger("abastecimiento.db")


class SentenciaNoPermitida(RuntimeError):
    """Se intentó ejecutar algo que no es una consulta de lectura."""


class ErrorBaseDatos(RuntimeError):
    """Fallo al hablar con SQL Server o con el servidor vinculado FoxPro."""


# Palabras que jamás deben aparecer en una sentencia de este backend.
# Se buscan como palabra completa para no chocar con nombres de columna
# (p. ej. `fecha_update` no debe disparar por contener "update").
_PROHIBIDAS = (
    "insert", "update", "delete", "drop", "alter", "create", "truncate",
    "merge", "grant", "revoke", "backup", "restore", "shutdown", "kill",
    "exec", "execute", "sp_executesql", "openrowset", "opendatasource",
    "bulk", "writetext", "updatetext", "dbcc", "reconfigure", "into",
)
_PATRON_PROHIBIDAS = re.compile(
    r"\b(" + "|".join(_PROHIBIDAS) + r")\b", re.IGNORECASE
)
_PATRON_COMENTARIO_LINEA = re.compile(r"--[^\n]*")
_PATRON_COMENTARIO_BLOQUE = re.compile(r"/\*.*?\*/", re.DOTALL)


def verificar_solo_lectura(sql: str) -> None:
    """Lanza `SentenciaNoPermitida` si `sql` no es una consulta de lectura pura.

    Se analiza la sentencia sin comentarios para que no se pueda esconder
    una escritura detrás de un `--` o de un `/* */`.
    """
    if not get_settings().db_solo_lectura:
        return

    limpia = _PATRON_COMENTARIO_BLOQUE.sub(" ", sql)
    limpia = _PATRON_COMENTARIO_LINEA.sub(" ", limpia).strip()

    if not re.match(r"^\s*(select|with)\b", limpia, re.IGNORECASE):
        raise SentenciaNoPermitida(
            "Solo se permiten consultas SELECT. Este sistema es de solo lectura."
        )

    # Varias sentencias encadenadas: se ignora un ';' final suelto.
    if ";" in limpia.rstrip().rstrip(";"):
        raise SentenciaNoPermitida(
            "No se permite encadenar varias sentencias en una misma consulta."
        )

    # Las cadenas literales llevan texto de negocio (glosas, descripciones)
    # que puede contener estas palabras de forma legítima; se excluyen del
    # análisis para no generar falsos positivos.
    sin_literales = re.sub(r"'(?:[^']|'')*'", "''", limpia)
    encontrada = _PATRON_PROHIBIDAS.search(sin_literales)
    if encontrada:
        raise SentenciaNoPermitida(
            f"Sentencia bloqueada: contiene la operación de escritura "
            f"'{encontrada.group(1).upper()}'. Este sistema es de solo lectura."
        )


# ──────────────────────────────────────────────────────────────────────
#  Conexión
# ──────────────────────────────────────────────────────────────────────
# pyodbc no garantiza que una conexión se pueda compartir entre hilos, y
# FastAPI atiende los endpoints síncronos en un pool de hilos. Se guarda
# una conexión por hilo y se reutiliza, que es mucho más barato que abrir
# una nueva en cada consulta (el saludo TLS contra SQL Server 2008 cuesta).
_local = threading.local()


# SQLSTATEs que significan «esta conexión ya no sirve». No son errores de la
# consulta: son la conexión caída por debajo. La respuesta correcta no es
# enseñárselos al usuario, es abrir otra y repetir.
_ESTADOS_DESCONEXION = frozenset({
    "08S01",  # fallo del vínculo de comunicación
    "08003",  # la conexión no está abierta
    "08007",  # se cayó durante una transacción
    "08001",  # no se pudo establecer
})


# Lo mismo, pero cuando pyodbc no da SQLSTATE: la conexión cerrada en local
# (por ejemplo tras un reinicio del driver) llega como ProgrammingError.
_TEXTOS_DESCONEXION = (
    "communication link failure",
    "vínculo de comunicación",
    "vinculo de comunicacion",
    "attempt to use a closed connection",
    "connection is busy",
    "the connection is broken",
)


def _es_desconexion(exc: pyodbc.Error) -> bool:
    """¿Este error es «la conexión murió» y no «la consulta está mal»?

    La distinción importa: lo primero se arregla solo abriendo otra y
    repitiendo; lo segundo hay que enseñárselo a quien escribió la consulta.
    """
    estado = exc.args[0] if exc.args else ""
    if estado in _ESTADOS_DESCONEXION:
        return True
    texto = str(exc).lower()
    return any(t in texto for t in _TEXTOS_DESCONEXION)


def cerrar_conexion_del_hilo() -> None:
    """Tira la conexión de este hilo para que la siguiente consulta abra otra."""
    conexion = getattr(_local, "conexion", None)
    _local.conexion = None
    if conexion is not None:
        try:
            conexion.close()
        except pyodbc.Error:
            pass


def _conexion_del_hilo() -> pyodbc.Connection:
    conexion = getattr(_local, "conexion", None)
    if conexion is not None:
        # Ojo: NO se comprueba aquí si la conexión sigue viva. Crear un
        # cursor no toca la red, así que una conexión muerta pasaría la
        # prueba igual; y hacer un SELECT de sondeo costaría una ida y
        # vuelta en CADA consulta. Quien detecta la caída es `consultar()`,
        # que reintenta con una conexión nueva — ver `_es_desconexion`.
        return conexion

    ajustes = get_settings()
    if not ajustes.db_user or not ajustes.db_password:
        raise ErrorBaseDatos(
            "Faltan DB_USER o DB_PASSWORD en el archivo .env de la raíz del proyecto."
        )

    try:
        conexion = pyodbc.connect(ajustes.cadena_conexion, autocommit=True)
    except pyodbc.Error as exc:
        raise ErrorBaseDatos(
            f"No se pudo conectar a {ajustes.db_host}:{ajustes.db_port}/"
            f"{ajustes.db_name}. Revisa la red interna y las credenciales "
            f"del archivo .env. Detalle: {exc}"
        ) from exc

    conexion.timeout = ajustes.db_query_timeout
    _local.conexion = conexion
    return conexion


@contextmanager
def cursor() -> Iterator[pyodbc.Cursor]:
    cur = _conexion_del_hilo().cursor()
    try:
        yield cur
    finally:
        try:
            cur.close()
        except pyodbc.Error:
            pass


def consultar(sql: str, parametros: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    """Ejecuta un SELECT y devuelve las filas como diccionarios.

    Los `char(n)` de FoxPro vienen rellenos de espacios: sin recortarlos,
    'PERNO   ' y 'PERNO' serían claves distintas y toda agrupación quedaría
    partida. Por eso se hace `strip()` a cada texto al salir.
    """
    verificar_solo_lectura(sql)

    inicio = time.perf_counter()

    # Se reintenta UNA vez si la conexión estaba caída. Repetir es seguro por
    # construcción: `verificar_solo_lectura` acaba de garantizar que esto es
    # un SELECT, y un SELECT se puede ejecutar dos veces sin consecuencias.
    # El caso típico es el primer uso de la mañana, con el backend levantado
    # desde el día anterior y la conexión muerta durante la noche.
    for intento in (1, 2):
        try:
            with cursor() as cur:
                cur.execute(sql, parametros or [])
                columnas = [c[0] for c in cur.description]
                filas = [
                    {
                        col: (valor.strip() if isinstance(valor, str) else valor)
                        for col, valor in zip(columnas, fila)
                    }
                    for fila in cur.fetchall()
                ]
            break
        except pyodbc.Error as exc:
            if intento == 1 and _es_desconexion(exc):
                log.warning(
                    "Conexión con SQL Server caída (%s). Se abre otra y se repite "
                    "la consulta.", exc.args[0] if exc.args else exc,
                )
                cerrar_conexion_del_hilo()
                continue
            log.error("Consulta fallida: %s | SQL: %s", exc, sql[:500])
            raise ErrorBaseDatos(_mensaje_entendible(exc)) from exc

    transcurrido = time.perf_counter() - inicio
    if transcurrido > 5:
        log.info("Consulta lenta: %.1f s, %d filas", transcurrido, len(filas))
    return filas


def _mensaje_entendible(exc: pyodbc.Error) -> str:
    """Traduce los errores crípticos del proveedor OLE DB de FoxPro."""
    texto = str(exc)
    if "Cannot get the column information" in texto:
        return (
            "El servidor vinculado FoxPro rechazó la consulta. Suele deberse a "
            "una expresión que el motor VFP no sabe resolver (por ejemplo YEAR() "
            "dentro de GROUP BY, o comparar un campo char con un número)."
        )
    if "Login failed" in texto or "28000" in texto:
        return (
            "Credenciales rechazadas por SQL Server. Revisa DB_USER y DB_PASSWORD "
            "en el archivo .env de la raíz."
        )
    if "timeout" in texto.lower():
        return (
            "La consulta superó el tiempo máximo. Reduce el rango de fechas o "
            "sube DB_QUERY_TIMEOUT en el .env."
        )
    if _es_desconexion(exc):
        return (
            "Se perdió la conexión con SQL Server mientras se consultaba, y el "
            "reintento tampoco prosperó. Suele ser la red interna o el servidor "
            "192.168.1.250 reiniciándose. Vuelve a intentarlo en un momento; si "
            "sigue igual, avisa a sistemas."
        )
    if "Data source name not found" in texto or "IM002" in texto:
        return (
            "No se encontró el driver ODBC indicado en DB_DRIVER. Instálalo o "
            "cambia el valor en el .env (por ejemplo a 'SQL Server')."
        )
    return f"Error de base de datos: {texto}"


def probar_conexion() -> dict[str, Any]:
    """Comprobación usada por /api/salud: identidad y acceso al puente FoxPro."""
    ajustes = get_settings()
    resultado: dict[str, Any] = {"sql_server": False, "foxpro": False}

    filas = consultar(
        "SELECT SUSER_NAME() AS login, DB_NAME() AS base, @@VERSION AS version"
    )
    if filas:
        resultado["sql_server"] = True
        resultado["login"] = filas[0]["login"]
        resultado["base"] = filas[0]["base"]
        resultado["version"] = str(filas[0]["version"]).split("\n")[0].strip()

    filas = consultar(
        f"SELECT * FROM OPENQUERY({ajustes.db_linked_server}, "
        f"'SELECT COUNT(*) AS n FROM empresas')"
    )
    resultado["foxpro"] = bool(filas)
    return resultado
