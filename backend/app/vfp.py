"""
Ayudas para construir consultas contra el servidor vinculado FoxPro.

El acceso va siempre así:

    SELECT ... FROM OPENQUERY(FOX, 'SELECT ... FROM detalle WHERE ...')

La cadena interior la interpreta el motor de Visual FoxPro, que tiene su
propia sintaxis. Reglas verificadas contra el servidor de producción:

  * Fechas literales: {^2026-01-01}
  * Cadenas dentro de la cadena remota: comillas dobles -> docu_id = "058"
  * Una comilla simple dentro de la cadena T-SQL se escribe duplicada ('')
  * Hay que AGREGAR del lado de VFP: traer las filas crudas para sumarlas
    aquí cuesta minutos; el mismo SUM() embebido responde en segundos.
  * YEAR() dentro de GROUP BY falla con "Error no especificado".

SEGURIDAD: ningún valor recibido del usuario se interpola sin pasar antes
por `codigo_seguro()` o `texto_busqueda_seguro()`. Como la consulta remota
viaja como texto, no existen parámetros enlazados; la única defensa válida
es una lista blanca estricta de caracteres, no un escapado.
"""

from __future__ import annotations

import re
from datetime import date

# Códigos del ERP: producto_id, areaorigen_id, usuario_id, almacen_id,
# ccosto_id. Alfanuméricos con separadores simples. Todo lo demás se rechaza.
_CODIGO_VALIDO = re.compile(r"^[A-Za-z0-9._/\- ]{1,30}$")


class ValorInvalido(ValueError):
    """Un valor recibido no pasó la lista blanca y no se enviará a la base."""


def codigo_seguro(valor: str, campo: str) -> str:
    """Valida un código del ERP antes de incrustarlo en la consulta remota."""
    limpio = (valor or "").strip()
    if not _CODIGO_VALIDO.match(limpio):
        raise ValorInvalido(
            f"El valor de '{campo}' no es válido. Solo se admiten letras, "
            f"números, punto, guion, barra y espacio (máximo 30 caracteres)."
        )
    return limpio


def texto_busqueda_seguro(valor: str) -> str:
    """Valida un texto de búsqueda libre (descripciones de producto).

    Se permiten letras, números, espacios y unos pocos signos habituales en
    las descripciones del catálogo ("BOLSA 27.5\" X 50\"" se busca sin las
    comillas). Se rechazan comillas y caracteres de control, que son lo que
    podría romper la cadena remota.
    """
    limpio = (valor or "").strip()
    if len(limpio) > 60:
        raise ValorInvalido("El texto de búsqueda no puede superar 60 caracteres.")
    if not re.match(r"^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ .,_/#+\-]*$", limpio):
        raise ValorInvalido(
            "El texto de búsqueda contiene caracteres no permitidos."
        )
    return limpio


def fecha_vfp(valor: date) -> str:
    """Literal de fecha en sintaxis FoxPro: {^2026-01-01}."""
    return "{^%s}" % valor.strftime("%Y-%m-%d")


def cadena_vfp(valor: str) -> str:
    """Literal de texto para la consulta remota, con comillas dobles."""
    return f'"{valor}"'


def envolver(consulta_remota: str, servidor_vinculado: str) -> str:
    """Envuelve una consulta VFP en el OPENQUERY correspondiente.

    Las comillas simples de la consulta remota se duplican, que es como
    T-SQL escapa una comilla dentro de un literal.
    """
    escapada = consulta_remota.replace("'", "''")
    return f"SELECT * FROM OPENQUERY({servidor_vinculado}, '{escapada}')"


# ──────────────────────────────────────────────────────────────────────
#  Filtros comunes del dominio
# ──────────────────────────────────────────────────────────────────────

def filtro_vigente(alias_detalle: str = "d", alias_cabecera: str | None = "c") -> str:
    """Excluye filas borradas y documentos anulados.

    FoxPro no elimina físicamente: marca `campodel`. Y un documento anulado
    conserva sus líneas. Sin este filtro, TODOS los totales salen inflados.
    """
    partes = [
        f"EMPTY({alias_detalle}.campodel)",
        f"EMPTY({alias_detalle}.docu_anul)",
    ]
    if alias_cabecera:
        partes += [
            f"EMPTY({alias_cabecera}.campodel)",
            f"EMPTY({alias_cabecera}.docu_anul)",
        ]
    return " AND ".join(partes)


def union_cabecera_detalle(alias_detalle: str = "d", alias_cabecera: str = "c") -> str:
    """Clave compuesta que enlaza detalle con su cabecera."""
    return (
        f"{alias_detalle}.empresa_id = {alias_cabecera}.empresa_id AND "
        f"{alias_detalle}.docu_id = {alias_cabecera}.docu_id AND "
        f"{alias_detalle}.docuserie = {alias_cabecera}.docuserie AND "
        f"{alias_detalle}.docunum = {alias_cabecera}.docunum"
    )


def union_por_referencia(alias_hijo: str = "s", alias_origen: str = "c") -> str:
    """Enlaza un documento con el documento que lo originó.

    Se usa para atar la salida interna (009) al requerimiento de almacén
    (058) que la pidió: así se sabe cuánto de lo solicitado ya se despachó.
    """
    return (
        f"{alias_hijo}.empresa_id = {alias_origen}.empresa_id AND "
        f"{alias_hijo}.docref_id = {alias_origen}.docu_id AND "
        f"{alias_hijo}.docrefserie = {alias_origen}.docuserie AND "
        f"{alias_hijo}.docrefnum = {alias_origen}.docunum"
    )


# Tipos de documento de NetComercial usados por este módulo.
REQUERIMIENTO_ALMACEN = "058"
REQUERIMIENTO_COMPRA = "050"
INGRESO_COMPRA = "011"      # compra real: lo que efectivamente entró
PROVISION_COMPRA = "021"    # factura del proveedor
SALIDA_INTERNA = "009"      # consumo real desde almacén

# La orden de compra. No vive en cabecera/detalle como los demás documentos,
# sino en su propio par de tablas `pedidoscab`/`pedidosdet`. Por eso un
# levantamiento anterior concluyó por error que "el módulo de orden de compra
# no se usa": buscó documentos 007 en `cabecera` y no encontró ninguno.
# El ingreso de compra (011) sí la referencia con docref_id = "007", y ese
# vínculo es el que permite saber qué se pidió y todavía no ha llegado.
ORDEN_COMPRA = "007"
TABLA_ORDEN_CABECERA = "pedidoscab"
TABLA_ORDEN_DETALLE = "pedidosdet"

# Estados de `pedidoscab.estado`, confirmados contra las etiquetas que imprime
# el propio reporte oficial del ERP.
ORDEN_ATENDIDA = "A"
ORDEN_APROBADA = "R"

# Tipos de producto que nunca generan un ingreso físico: servicios, gastos y
# arrendamientos. Sus órdenes de compra jamás reciben un 011, así que contarlas
# como "en camino" las dejaría pendientes para siempre e inflaría el total
# (medido: 37 millones de unidades fantasma, dominadas por servicios).
TIPOS_SIN_INGRESO_FISICO = ("02", "10", "13")

# Columnas de saldo mensual en stoc<año>. Ojo: septiembre es 'sal_seti',
# no 'sal_sept' (verificado contra el servidor).
COLUMNAS_SALDO_MES = [
    "sal_ener", "sal_febr", "sal_marz", "sal_abri", "sal_mayo", "sal_juni",
    "sal_juli", "sal_agos", "sal_seti", "sal_octu", "sal_novi", "sal_dici",
]
