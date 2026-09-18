"""
Consultas de dominio contra NetComercial (FoxPro vía OPENQUERY).

Todas AGREGAN del lado de FoxPro. Traer filas crudas para sumarlas en
Python cuesta minutos; el mismo SUM() embebido responde en segundos.

Tiempos medidos contra producción (2026-09-14):
    consolidado de un año completo .......... ~14 s  (4.137 productos)
    atendido de un mes ....................... ~6 s
    stock actual (tabla stoc2026) ........... ~0,7 s
    maestro de productos completo ............ ~4 s  (26.523 artículos)
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from . import cache, vfp
from .config import get_settings
from .db import consultar


def _openquery(consulta_remota: str) -> str:
    return vfp.envolver(consulta_remota, get_settings().db_linked_server)


def _filtros_cabecera(
    area: str | None, usuario: str | None, almacen: str | None
) -> str:
    """Filtros opcionales de la pantalla, validados contra lista blanca."""
    partes: list[str] = []
    if area:
        partes.append(f"c.areaorigen_id = {vfp.cadena_vfp(vfp.codigo_seguro(area, 'área'))}")
    if usuario:
        partes.append(
            f"c.usuario_id = {vfp.cadena_vfp(vfp.codigo_seguro(usuario, 'usuario'))}"
        )
    if almacen:
        partes.append(
            f"d.almacen_id = {vfp.cadena_vfp(vfp.codigo_seguro(almacen, 'almacén'))}"
        )
    return (" AND " + " AND ".join(partes)) if partes else ""


# ──────────────────────────────────────────────────────────────────────
#  1. Consolidado de requerimientos de almacén (documento 058)
# ──────────────────────────────────────────────────────────────────────

def consolidado_solicitado(
    desde: date,
    hasta: date,
    area: str | None = None,
    usuario: str | None = None,
    almacen: str | None = None,
) -> list[dict[str, Any]]:
    """Suma por producto todo lo pedido en requerimientos de almacén.

    `pendiente_erp` es el `cant_pend` que mantiene el propio NetComercial:
    un segundo termómetro, independiente de lo que registre el almacenero.
    """
    remota = (
        "SELECT d.producto_id, "
        "SUM(d.cantidad) AS solicitado, "
        "SUM(d.cant_pend) AS pendiente_erp, "
        "COUNT(*) AS lineas, "
        "COUNT(DISTINCT d.docunum) AS documentos, "
        "MIN(c.fecdocumen) AS primera_fecha, "
        "MAX(c.fecdocumen) AS ultima_fecha "
        "FROM detalle d "
        f"INNER JOIN cabecera c ON {vfp.union_cabecera_detalle()} "
        f"WHERE d.docu_id = {vfp.cadena_vfp(vfp.REQUERIMIENTO_ALMACEN)} "
        f"AND c.fecdocumen >= {vfp.fecha_vfp(desde)} "
        f"AND c.fecdocumen <= {vfp.fecha_vfp(hasta)} "
        f"AND {vfp.filtro_vigente()} "
        "AND NOT EMPTY(d.producto_id)"
        f"{_filtros_cabecera(area, usuario, almacen)} "
        "GROUP BY d.producto_id"
    )
    return consultar(_openquery(remota))


def consolidado_atendido(
    desde: date,
    hasta: date,
    area: str | None = None,
    usuario: str | None = None,
    almacen: str | None = None,
) -> dict[str, float]:
    """Cuánto de lo solicitado ya salió del almacén (documento 009).

    Se enlaza la salida interna con el requerimiento que la originó a nivel
    de ítem, así el rango de fechas sigue siendo el del requerimiento y no
    el de la salida. En 2026, 57.924 de 72.268 salidas (80 %) traen ese
    vínculo; el resto se despachó sin referenciar y no se puede atribuir.
    """
    remota = (
        "SELECT s.producto_id, SUM(s.cantidad) AS atendido "
        "FROM detalle s "
        f"INNER JOIN cabecera c ON {vfp.union_por_referencia()} "
        f"WHERE s.docu_id = {vfp.cadena_vfp(vfp.SALIDA_INTERNA)} "
        f"AND s.docref_id = {vfp.cadena_vfp(vfp.REQUERIMIENTO_ALMACEN)} "
        f"AND c.fecdocumen >= {vfp.fecha_vfp(desde)} "
        f"AND c.fecdocumen <= {vfp.fecha_vfp(hasta)} "
        "AND EMPTY(s.campodel) AND EMPTY(s.docu_anul) "
        "AND EMPTY(c.campodel) AND EMPTY(c.docu_anul) "
        "AND NOT EMPTY(s.producto_id)"
    )
    # El filtro de almacén se aplica sobre la salida, no sobre el detalle
    # del requerimiento: aquí `d` no existe.
    extra: list[str] = []
    if area:
        extra.append(
            f"c.areaorigen_id = {vfp.cadena_vfp(vfp.codigo_seguro(area, 'área'))}"
        )
    if usuario:
        extra.append(
            f"c.usuario_id = {vfp.cadena_vfp(vfp.codigo_seguro(usuario, 'usuario'))}"
        )
    if almacen:
        extra.append(
            f"s.almacen_id = {vfp.cadena_vfp(vfp.codigo_seguro(almacen, 'almacén'))}"
        )
    if extra:
        remota += " AND " + " AND ".join(extra)
    remota += " GROUP BY s.producto_id"

    filas = consultar(_openquery(remota))
    return {f["producto_id"]: float(f["atendido"] or 0) for f in filas}


def detalle_requerimientos_de_producto(
    producto_id: str,
    desde: date,
    hasta: date,
    area: str | None = None,
    usuario: str | None = None,
    almacen: str | None = None,
) -> list[dict[str, Any]]:
    """Los requerimientos individuales que componen el total de un producto.

    Responde a "¿de dónde salen estas 300 unidades?". Como la glosa está
    vacía en toda la base, se devuelve todo el contexto que sí existe:
    documento, fecha, usuario, área, centro de costo, almacén, la orden de
    trabajo que lo originó y la `referencia` cuando el solicitante la puso.
    """
    codigo = vfp.codigo_seguro(producto_id, "producto")
    remota = (
        "SELECT d.docuserie, d.docunum, d.item, c.fecdocumen, c.usuario_id, "
        "c.areaorigen_id, c.ccosto_id, d.almacen_id, d.cantidad, d.cant_pend, "
        "d.referencia, c.estado, c.estado2, c.flagaprobar, c.usuarioaprob, "
        "c.fechaaprob, c.docref_id, c.docrefserie, c.docrefnum, c.fechaentrega "
        "FROM detalle d "
        f"INNER JOIN cabecera c ON {vfp.union_cabecera_detalle()} "
        f"WHERE d.docu_id = {vfp.cadena_vfp(vfp.REQUERIMIENTO_ALMACEN)} "
        f"AND d.producto_id = {vfp.cadena_vfp(codigo)} "
        f"AND c.fecdocumen >= {vfp.fecha_vfp(desde)} "
        f"AND c.fecdocumen <= {vfp.fecha_vfp(hasta)} "
        f"AND {vfp.filtro_vigente()}"
        f"{_filtros_cabecera(area, usuario, almacen)} "
        "ORDER BY c.fecdocumen DESC, d.docunum DESC"
    )
    return consultar(_openquery(remota))


def atendido_por_requerimiento(
    producto_id: str, desde: date, hasta: date
) -> dict[str, float]:
    """Cuánto se despachó contra cada requerimiento concreto de un producto.

    La clave es "serie-numero", para casar con las filas del detalle.
    """
    codigo = vfp.codigo_seguro(producto_id, "producto")
    remota = (
        "SELECT s.docrefserie, s.docrefnum, SUM(s.cantidad) AS atendido "
        "FROM detalle s "
        f"INNER JOIN cabecera c ON {vfp.union_por_referencia()} "
        f"WHERE s.docu_id = {vfp.cadena_vfp(vfp.SALIDA_INTERNA)} "
        f"AND s.docref_id = {vfp.cadena_vfp(vfp.REQUERIMIENTO_ALMACEN)} "
        f"AND s.producto_id = {vfp.cadena_vfp(codigo)} "
        f"AND c.fecdocumen >= {vfp.fecha_vfp(desde)} "
        f"AND c.fecdocumen <= {vfp.fecha_vfp(hasta)} "
        "AND EMPTY(s.campodel) AND EMPTY(s.docu_anul) "
        "GROUP BY s.docrefserie, s.docrefnum"
    )
    filas = consultar(_openquery(remota))
    return {
        f"{(f['docrefserie'] or '').strip()}-{(f['docrefnum'] or '').strip()}":
            float(f["atendido"] or 0)
        for f in filas
    }


# ──────────────────────────────────────────────────────────────────────
#  2. Movimientos históricos de un producto (para las gráficas)
# ──────────────────────────────────────────────────────────────────────

def movimientos_producto(
    producto_id: str, desde: date, hasta: date
) -> list[dict[str, Any]]:
    """Compras, consumos y pedidos de un producto, línea a línea.

    No se agrupa por mes del lado de FoxPro porque YEAR()/MONTH() dentro de
    GROUP BY fallan ahí; para un solo producto son decenas de filas y el
    agrupado mensual se arma en Python sin coste apreciable.

    El costo se toma de `costounitmn`/`costototalmn`, que NetComercial ya
    convirtió a soles con el tipo de cambio del día. `precio_uni` está
    siempre en cero en los ingresos de compra: usarlo da cero y parece que
    funciona.
    """
    codigo = vfp.codigo_seguro(producto_id, "producto")
    tipos = (
        f"d.docu_id = {vfp.cadena_vfp(vfp.INGRESO_COMPRA)} OR "
        f"d.docu_id = {vfp.cadena_vfp(vfp.SALIDA_INTERNA)} OR "
        f"d.docu_id = {vfp.cadena_vfp(vfp.REQUERIMIENTO_ALMACEN)}"
    )
    remota = (
        "SELECT d.docu_id, d.docuserie, d.docunum, d.fecregistro, d.cantidad, "
        "d.costo_unit, d.costounitmn, d.costototalmn, d.moncompra, d.prov_id, "
        "d.almacen_id, d.usuario_id "
        "FROM detalle d "
        f"WHERE d.producto_id = {vfp.cadena_vfp(codigo)} "
        f"AND ({tipos}) "
        f"AND d.fecregistro >= {vfp.fecha_vfp(desde)} "
        f"AND d.fecregistro <= {vfp.fecha_vfp(hasta)} "
        f"AND {vfp.filtro_vigente(alias_cabecera=None)} "
        "ORDER BY d.fecregistro"
    )
    return consultar(_openquery(remota))


def compras_por_producto(desde: date, hasta: date) -> dict[str, dict[str, float]]:
    """Total comprado por producto en el periodo (ingreso de compra 011).

    Se usa 011 y NO 021: la provisión repite la misma cantidad con costo
    cero, así que sumar ambos duplicaría las unidades. Verificado sobre el
    artículo 10004443, que aparece en los dos documentos por cada compra.
    """
    remota = (
        "SELECT d.producto_id, SUM(d.cantidad) AS cantidad, "
        "SUM(d.costototalmn) AS importe, COUNT(*) AS veces, "
        "MAX(d.fecregistro) AS ultima_compra "
        "FROM detalle d "
        f"WHERE d.docu_id = {vfp.cadena_vfp(vfp.INGRESO_COMPRA)} "
        f"AND d.fecregistro >= {vfp.fecha_vfp(desde)} "
        f"AND d.fecregistro <= {vfp.fecha_vfp(hasta)} "
        f"AND {vfp.filtro_vigente(alias_cabecera=None)} "
        "AND NOT EMPTY(d.producto_id) "
        "GROUP BY d.producto_id"
    )
    filas = consultar(_openquery(remota))
    return {
        f["producto_id"]: {
            "cantidad": float(f["cantidad"] or 0),
            "importe": float(f["importe"] or 0),
            "veces": int(f["veces"] or 0),
            "ultima_compra": f["ultima_compra"],
        }
        for f in filas
    }


def consumo_por_producto(desde: date, hasta: date) -> dict[str, float]:
    """Total consumido por producto en el periodo (salida interna 009)."""
    remota = (
        "SELECT d.producto_id, SUM(d.cantidad) AS cantidad "
        "FROM detalle d "
        f"WHERE d.docu_id = {vfp.cadena_vfp(vfp.SALIDA_INTERNA)} "
        f"AND d.fecregistro >= {vfp.fecha_vfp(desde)} "
        f"AND d.fecregistro <= {vfp.fecha_vfp(hasta)} "
        f"AND {vfp.filtro_vigente(alias_cabecera=None)} "
        "AND NOT EMPTY(d.producto_id) "
        "GROUP BY d.producto_id"
    )
    filas = consultar(_openquery(remota))
    return {f["producto_id"]: float(f["cantidad"] or 0) for f in filas}


# ──────────────────────────────────────────────────────────────────────
#  2b. Órdenes de compra (tablas pedidoscab / pedidosdet)
# ──────────────────────────────────────────────────────────────────────

def _union_orden(alias_det: str = "d", alias_cab: str = "c") -> str:
    return (
        f"{alias_det}.empresa_id = {alias_cab}.empresa_id AND "
        f"{alias_det}.docu_id = {alias_cab}.docu_id AND "
        f"{alias_det}.docuserie = {alias_cab}.docuserie AND "
        f"{alias_det}.docunum = {alias_cab}.docunum"
    )


def ordenes_por_producto(desde: date, hasta: date) -> dict[str, dict[str, Any]]:
    """Lo ordenado a proveedores por producto en el periodo.

    Es una fuente distinta de `compras_por_producto` (que lee el ingreso
    físico 011): aquí está lo que se pidió y a qué precio se negoció, haya
    llegado o no.
    """
    remota = (
        "SELECT d.producto_id, SUM(d.cantidad) AS cantidad, "
        "SUM(d.valor_compra) AS importe, COUNT(1) AS lineas, "
        "MAX(d.fecdocumen) AS ultima_orden "
        f"FROM {vfp.TABLA_ORDEN_DETALLE} d "
        f"INNER JOIN {vfp.TABLA_ORDEN_CABECERA} c ON {_union_orden()} "
        f"WHERE d.fecdocumen >= {vfp.fecha_vfp(desde)} "
        f"AND d.fecdocumen <= {vfp.fecha_vfp(hasta)} "
        "AND EMPTY(d.campodel) AND EMPTY(d.docu_anul) AND EMPTY(c.docu_anul) "
        "AND NOT EMPTY(d.producto_id) "
        "GROUP BY d.producto_id"
    )
    filas = consultar(_openquery(remota))
    return {
        f["producto_id"]: {
            "cantidad": float(f["cantidad"] or 0),
            "importe": float(f["importe"] or 0),
            "lineas": int(f["lineas"] or 0),
            "ultima_orden": f["ultima_orden"],
        }
        for f in filas
    }


def en_camino_por_producto(dias: int | None = None) -> dict[str, float]:
    """Lo ya pedido a proveedores que todavía no ha llegado.

    Es la cifra que evita comprar dos veces lo mismo. Se calcula orden por
    orden —lo pedido menos lo efectivamente recibido contra ESA orden— y no
    comparando totales, porque un ingreso puede corresponder a una orden de
    fuera del periodo.

    Dos salvaguardas, ambas necesarias (medidas contra producción):

    * Se excluyen servicios, gastos y arrendamientos: nunca reciben un 011,
      así que quedarían "en camino" para siempre. Sin este filtro el total
      sube de 2,5 a 37 millones de unidades fantasma.
    * Solo se miran órdenes recientes. Una orden sin recibir de hace un año
      no está en tránsito: está muerta o mal cerrada.
    """
    ventana = dias if dias is not None else get_settings().dias_en_camino
    desde = date.today() - timedelta(days=ventana)

    def calcular() -> dict[str, float]:
        remota_ordenes = (
            "SELECT d.producto_id, d.docunum, SUM(d.cantidad) AS cantidad "
            f"FROM {vfp.TABLA_ORDEN_DETALLE} d "
            f"INNER JOIN {vfp.TABLA_ORDEN_CABECERA} c ON {_union_orden()} "
            f"WHERE d.fecdocumen >= {vfp.fecha_vfp(desde)} "
            # Hay órdenes tecleadas con año 2202. Sin tope, una fecha futura
            # entra siempre como "en camino" y nunca se resuelve.
            f"AND d.fecdocumen <= {vfp.fecha_vfp(date.today())} "
            "AND EMPTY(d.campodel) AND EMPTY(d.docu_anul) "
            "AND EMPTY(c.docu_anul) AND EMPTY(c.estadocierre) "
            "AND NOT EMPTY(d.producto_id) "
            "GROUP BY d.producto_id, d.docunum"
        )
        ordenes = consultar(_openquery(remota_ordenes))

        remota_recibido = (
            "SELECT producto_id, docrefnum, SUM(cantidad) AS cantidad "
            f"FROM detalle WHERE docu_id = {vfp.cadena_vfp(vfp.INGRESO_COMPRA)} "
            f"AND docref_id = {vfp.cadena_vfp(vfp.ORDEN_COMPRA)} "
            f"AND fecregistro >= {vfp.fecha_vfp(desde)} "
            "AND EMPTY(campodel) AND EMPTY(docu_anul) "
            "GROUP BY producto_id, docrefnum"
        )
        recibido = {
            (f["producto_id"], f["docrefnum"]): float(f["cantidad"] or 0)
            for f in consultar(_openquery(remota_recibido))
        }

        maestro = maestro_productos()
        pendiente: dict[str, float] = {}
        for orden in ordenes:
            pid = orden["producto_id"]
            tipo = maestro.get(pid, {}).get("tipoprod_id", "")
            if tipo in vfp.TIPOS_SIN_INGRESO_FISICO:
                continue
            falta = float(orden["cantidad"] or 0) - recibido.get((pid, orden["docunum"]), 0.0)
            if falta > 0.001:
                pendiente[pid] = pendiente.get(pid, 0.0) + falta
        return pendiente

    return cache.obtener_o_calcular(f"en_camino:{ventana}", calcular)


def ordenes_de_producto(
    producto_id: str, desde: date, hasta: date
) -> list[dict[str, Any]]:
    """Las órdenes de compra de un producto, una por una, con su recepción."""
    codigo = vfp.codigo_seguro(producto_id, "producto")
    remota = (
        "SELECT d.docuserie, d.docunum, d.fecdocumen, d.cantidad, d.costo_unit, "
        "d.valor_compra, c.estado, c.prov_id, c.prov, c.moneda_id, c.tipocambio, "
        "c.fechaentrega, c.usuario_id, c.areaorigen_id, d.referencia "
        f"FROM {vfp.TABLA_ORDEN_DETALLE} d "
        f"INNER JOIN {vfp.TABLA_ORDEN_CABECERA} c ON {_union_orden()} "
        f"WHERE d.producto_id = {vfp.cadena_vfp(codigo)} "
        f"AND d.fecdocumen >= {vfp.fecha_vfp(desde)} "
        f"AND d.fecdocumen <= {vfp.fecha_vfp(hasta)} "
        "AND EMPTY(d.campodel) AND EMPTY(d.docu_anul) AND EMPTY(c.docu_anul) "
        "ORDER BY d.fecdocumen DESC"
    )
    ordenes = consultar(_openquery(remota))

    # Cuánto llegó contra cada orden, para saber qué sigue pendiente.
    remota_recibido = (
        "SELECT docrefnum, docunum, fecregistro, SUM(cantidad) AS cantidad "
        f"FROM detalle WHERE docu_id = {vfp.cadena_vfp(vfp.INGRESO_COMPRA)} "
        f"AND docref_id = {vfp.cadena_vfp(vfp.ORDEN_COMPRA)} "
        f"AND producto_id = {vfp.cadena_vfp(codigo)} "
        "AND EMPTY(campodel) AND EMPTY(docu_anul) "
        "GROUP BY docrefnum, docunum, fecregistro"
    )
    recibido: dict[str, dict[str, Any]] = {}
    for f in consultar(_openquery(remota_recibido)):
        entrada = recibido.setdefault(
            f["docrefnum"], {"cantidad": 0.0, "ingresos": []}
        )
        entrada["cantidad"] += float(f["cantidad"] or 0)
        entrada["ingresos"].append(
            {"documento": f["docunum"], "fecha": f["fecregistro"]}
        )

    proveedores = catalogo_proveedores()
    resultado = []
    for o in ordenes:
        llegado = recibido.get(o["docunum"], {})
        cantidad = float(o["cantidad"] or 0)
        recibido_cant = float(llegado.get("cantidad", 0.0))
        nombre_prov = (o["prov"] or "").strip() or proveedores.get(o["prov_id"], "")
        resultado.append(
            {
                "documento": f"{o['docuserie']}-{o['docunum']}",
                "numero": o["docunum"],
                "fecha": o["fecdocumen"],
                "cantidad": round(cantidad, 3),
                "recibido": round(recibido_cant, 3),
                "pendiente": round(max(0.0, cantidad - recibido_cant), 3),
                "costo_unitario": round(float(o["costo_unit"] or 0), 4),
                "importe": round(float(o["valor_compra"] or 0), 2),
                "estado": (o["estado"] or "").strip(),
                "estado_texto": _texto_estado_orden(o["estado"]),
                "proveedor": nombre_prov or o["prov_id"] or "",
                "moneda": "USD" if str(o["moneda_id"]).strip() == "2" else "PEN",
                "fecha_entrega": o["fechaentrega"],
                "usuario": o["usuario_id"],
                "referencia": o["referencia"] or "",
                "ingresos": llegado.get("ingresos", []),
            }
        )
    return resultado


def _texto_estado_orden(valor: Any) -> str:
    codigo = (str(valor) if valor else "").strip().upper()
    if codigo == vfp.ORDEN_ATENDIDA:
        return "Atendida"
    if codigo == vfp.ORDEN_APROBADA:
        return "Aprobada"
    return codigo or "Sin estado"


def compras_por_comprador(desde: date) -> list[dict[str, Any]]:
    """Qué productos ha comprado cada usuario de logística, con su última fecha.

    NetComercial no sabe a quién va dirigido un requerimiento: los tres
    compradores ven la misma bandeja global. El reparto de códigos es un
    acuerdo interno que no está en ninguna tabla. La única huella que deja
    en el sistema es **quién emitió la orden de compra**, y de ahí se
    reconstruye el reparto.
    """
    remota = (
        "SELECT d.producto_id, c.usuario_id, COUNT(1) AS ordenes, "
        "SUM(d.cantidad) AS unidades, MAX(d.fecdocumen) AS ultima "
        f"FROM {vfp.TABLA_ORDEN_DETALLE} d "
        f"INNER JOIN {vfp.TABLA_ORDEN_CABECERA} c ON {_union_orden()} "
        f"WHERE d.fecdocumen >= {vfp.fecha_vfp(desde)} "
        f"AND d.fecdocumen <= {vfp.fecha_vfp(date.today())} "
        "AND EMPTY(d.campodel) AND EMPTY(d.docu_anul) AND EMPTY(c.docu_anul) "
        "AND NOT EMPTY(d.producto_id) AND NOT EMPTY(c.usuario_id) "
        "GROUP BY d.producto_id, c.usuario_id"
    )
    return consultar(_openquery(remota))


def proveedores_de_producto(
    producto_id: str, desde: date, hasta: date
) -> list[dict[str, Any]]:
    """Proveedores a los que se le ha comprado un producto, con sus precios.

    Los precios se convierten a soles antes de compararlos: de las 5.322
    órdenes de 2026, 1.873 están en dólares. Comparar sin convertir haría
    parecer barato a un proveedor que cobra en moneda distinta.
    """
    codigo = vfp.codigo_seguro(producto_id, "producto")
    remota = (
        "SELECT c.prov_id, c.moneda_id, c.tipocambio, d.costo_unit, "
        "d.cantidad, d.fecdocumen, d.docunum, c.dias_cred, c.usuario_id "
        f"FROM {vfp.TABLA_ORDEN_DETALLE} d "
        f"INNER JOIN {vfp.TABLA_ORDEN_CABECERA} c ON {_union_orden()} "
        f"WHERE d.producto_id = {vfp.cadena_vfp(codigo)} "
        f"AND d.fecdocumen >= {vfp.fecha_vfp(desde)} "
        f"AND d.fecdocumen <= {vfp.fecha_vfp(hasta)} "
        "AND EMPTY(d.campodel) AND EMPTY(d.docu_anul) AND EMPTY(c.docu_anul) "
        "AND d.cantidad > 0 AND NOT EMPTY(c.prov_id) "
        "ORDER BY d.fecdocumen"
    )
    filas = consultar(_openquery(remota))
    nombres = catalogo_proveedores()

    agrupado: dict[str, dict[str, Any]] = {}
    for f in filas:
        pid = f["prov_id"]
        moneda = str(f["moneda_id"] or "1").strip()
        tc = float(f["tipocambio"] or 0)
        precio = float(f["costo_unit"] or 0)
        if precio <= 0:
            continue
        # Moneda 2 = dólares. Si falta el tipo de cambio del documento no se
        # inventa uno: se descarta la línea antes que mezclar monedas.
        if moneda == "2":
            if tc <= 0:
                continue
            precio_soles = precio * tc
        else:
            precio_soles = precio

        registro = agrupado.setdefault(
            pid,
            {
                "proveedor_id": pid,
                "proveedor": nombres.get(pid, "") or pid,
                "ordenes": 0,
                "unidades": 0.0,
                "importe_soles": 0.0,
                "precio_min": None,
                "precio_max": None,
                "ultimo_precio": None,
                "ultima_compra": None,
                "primera_compra": None,
                "dias_credito": 0,
                "monedas": set(),
                "compradores": set(),
                "historial": [],
            },
        )
        cantidad = float(f["cantidad"] or 0)
        registro["ordenes"] += 1
        registro["unidades"] += cantidad
        registro["importe_soles"] += precio_soles * cantidad
        registro["monedas"].add("USD" if moneda == "2" else "PEN")
        if f["usuario_id"]:
            registro["compradores"].add(f["usuario_id"])
        registro["precio_min"] = (
            precio_soles if registro["precio_min"] is None else min(registro["precio_min"], precio_soles)
        )
        registro["precio_max"] = (
            precio_soles if registro["precio_max"] is None else max(registro["precio_max"], precio_soles)
        )
        fecha = f["fecdocumen"]
        if fecha and (registro["ultima_compra"] is None or fecha >= registro["ultima_compra"]):
            registro["ultima_compra"] = fecha
            registro["ultimo_precio"] = precio_soles
            registro["dias_credito"] = int(f["dias_cred"] or 0)
        if fecha and (registro["primera_compra"] is None or fecha < registro["primera_compra"]):
            registro["primera_compra"] = fecha
        registro["historial"].append(
            {
                "fecha": fecha,
                "documento": f["docunum"],
                "cantidad": round(cantidad, 3),
                "precio_soles": round(precio_soles, 4),
                "moneda": "USD" if moneda == "2" else "PEN",
                "precio_original": round(precio, 4),
            }
        )

    resultado = []
    for r in agrupado.values():
        promedio = r["importe_soles"] / r["unidades"] if r["unidades"] else 0.0
        r["historial"].sort(key=lambda h: (h["fecha"] is None, h["fecha"]), reverse=True)
        resultado.append(
            {
                **{k: v for k, v in r.items() if k not in ("monedas", "compradores")},
                "precio_promedio": round(promedio, 4),
                "precio_min": round(r["precio_min"] or 0, 4),
                "precio_max": round(r["precio_max"] or 0, 4),
                "ultimo_precio": round(r["ultimo_precio"] or 0, 4),
                "unidades": round(r["unidades"], 3),
                "importe_soles": round(r["importe_soles"], 2),
                "monedas": sorted(r["monedas"]),
                "compradores": sorted(r["compradores"]),
            }
        )
    return resultado


def proveedor_de_referencia(desde: date) -> dict[str, dict[str, Any]]:
    """El proveedor más barato de cada producto, con su precio en soles.

    Una sola consulta para todo el catálogo, cacheada: pedirlo producto a
    producto para armar un plan de 2.600 códigos tardaría minutos.
    """

    def calcular() -> dict[str, dict[str, Any]]:
        remota = (
            "SELECT d.producto_id, c.prov_id, d.costo_unit, c.moneda_id, "
            "c.tipocambio, d.fecdocumen "
            f"FROM {vfp.TABLA_ORDEN_DETALLE} d "
            f"INNER JOIN {vfp.TABLA_ORDEN_CABECERA} c ON {_union_orden()} "
            f"WHERE d.fecdocumen >= {vfp.fecha_vfp(desde)} "
            f"AND d.fecdocumen <= {vfp.fecha_vfp(date.today())} "
            "AND EMPTY(d.campodel) AND EMPTY(d.docu_anul) AND EMPTY(c.docu_anul) "
            "AND d.cantidad > 0 AND NOT EMPTY(c.prov_id) AND NOT EMPTY(d.producto_id)"
        )
        nombres = catalogo_proveedores()
        mejor: dict[str, dict[str, Any]] = {}
        for f in consultar(_openquery(remota)):
            precio = float(f["costo_unit"] or 0)
            if precio <= 0:
                continue
            # Un tercio de las órdenes se pacta en dólares. Sin convertir,
            # el "más barato" sería simplemente el que cotiza en otra moneda.
            if str(f["moneda_id"] or "1").strip() == "2":
                tc = float(f["tipocambio"] or 0)
                if tc <= 0:
                    continue
                precio *= tc
            pid = f["producto_id"]
            actual = mejor.get(pid)
            if actual is None or precio < actual["precio"]:
                mejor[pid] = {
                    "proveedor_id": f["prov_id"],
                    "proveedor": nombres.get(f["prov_id"], "") or f["prov_id"],
                    "precio": precio,
                    "fecha": f["fecdocumen"],
                }
        return mejor

    return cache.obtener_o_calcular(f"proveedor_ref:{desde}", calcular)


def consumo_anual_por_producto(desde: date, hasta: date) -> dict[str, float]:
    """Consumo real de almacén en el periodo, filtrando por las líneas que
    de verdad mueven inventario (`actu_stock`)."""

    def calcular() -> dict[str, float]:
        remota = (
            "SELECT producto_id, SUM(cantidad) AS cantidad FROM detalle "
            f"WHERE docu_id = {vfp.cadena_vfp(vfp.SALIDA_INTERNA)} "
            f"AND fecregistro >= {vfp.fecha_vfp(desde)} "
            f"AND fecregistro <= {vfp.fecha_vfp(hasta)} "
            'AND actu_stock = "S" '
            "AND EMPTY(campodel) AND EMPTY(docu_anul) AND NOT EMPTY(producto_id) "
            "GROUP BY producto_id"
        )
        return {
            f["producto_id"]: float(f["cantidad"] or 0)
            for f in consultar(_openquery(remota))
        }

    return cache.obtener_o_calcular(f"consumo_anual:{desde}:{hasta}", calcular)


def catalogo_proveedores() -> dict[str, str]:
    def calcular() -> dict[str, str]:
        try:
            filas = consultar(
                _openquery("SELECT prov_id, prov_name FROM proveedores")
            )
            return {
                f["prov_id"]: (f.get("prov_name") or "")
                for f in filas
                if f["prov_id"]
            }
        except Exception:
            return {}

    return cache.obtener_o_calcular("catalogo:proveedores", calcular)


# ──────────────────────────────────────────────────────────────────────
#  3. Stock y maestro de artículos (cacheados)
# ──────────────────────────────────────────────────────────────────────

def stock_actual(anio: int | None = None) -> dict[str, dict[str, Any]]:
    """Saldo por producto sumando todos los almacenes.

    `sal_actu` es el saldo vigente; las columnas `sal_<mes>` son cierres
    mensuales. `ultfecha` es la fecha del último movimiento y sirve de
    semáforo: "el sistema dice N unidades, último movimiento hace X días".
    """
    ejercicio = anio or date.today().year

    def calcular() -> dict[str, dict[str, Any]]:
        remota = (
            "SELECT producto_id, almacen_id, sal_actu, ultfecha "
            f"FROM stoc{ejercicio}"
        )
        filas = consultar(_openquery(remota))
        agregado: dict[str, dict[str, Any]] = {}
        for f in filas:
            pid = f["producto_id"]
            if not pid:
                continue
            registro = agregado.setdefault(
                pid, {"stock": 0.0, "ultima_fecha": None, "almacenes": {}}
            )
            saldo = float(f["sal_actu"] or 0)
            registro["stock"] += saldo
            if saldo:
                registro["almacenes"][f["almacen_id"]] = saldo
            fecha_mov = f["ultfecha"]
            # 1899-12-30 es la fecha vacía de FoxPro, no un movimiento real.
            if fecha_mov and fecha_mov.year > 1900:
                if registro["ultima_fecha"] is None or fecha_mov > registro["ultima_fecha"]:
                    registro["ultima_fecha"] = fecha_mov
        return agregado

    return cache.obtener_o_calcular(f"stock:{ejercicio}", calcular)


def maestro_productos() -> dict[str, dict[str, Any]]:
    """Catálogo de artículos, indexado por código.

    `estado` no se filtra dentro de la cadena remota: comparar un `char` de
    FoxPro con ="1" devuelve "Operator/operand type mismatch". Se filtra
    aquí, que además permite mostrar artículos dados de baja que todavía
    aparecen en requerimientos antiguos.
    """

    def calcular() -> dict[str, dict[str, Any]]:
        remota = (
            "SELECT producto_id, producto_name, unidmedi_id, familia_id, "
            "linea_id, marca, stockminimo, leadtime, costo_actu, "
            "fec_ult_comp, fec_ult_sali, estado, tipoprod_id "
            "FROM productos"
        )
        filas = consultar(_openquery(remota))
        return {
            f["producto_id"]: {
                "descripcion": f["producto_name"] or "",
                "unidad_id": f["unidmedi_id"] or "",
                "familia_id": f["familia_id"] or "",
                "linea_id": f["linea_id"] or "",
                "marca": f["marca"] or "",
                "tipoprod_id": (f["tipoprod_id"] or "").strip(),
                "stock_minimo": float(f["stockminimo"] or 0),
                "leadtime": float(f["leadtime"] or 0),
                "costo_referencia": float(f["costo_actu"] or 0),
                # `estado` llega como numérico en unas tablas y como texto en
                # otras, según cómo se definió el campo en cada DBF.
                "activo": str(f["estado"] or "").strip() in ("1", "1.0"),
            }
            for f in filas
            if f["producto_id"]
        }

    return cache.obtener_o_calcular("maestro:productos", calcular)


# ──────────────────────────────────────────────────────────────────────
#  4. Catálogos para los desplegables de filtros
# ──────────────────────────────────────────────────────────────────────

def catalogo_areas() -> list[dict[str, str]]:
    def calcular() -> list[dict[str, str]]:
        filas = consultar(
            _openquery("SELECT areaorigen_id, descripcion, estado FROM areasorigen")
        )
        areas = [
            {"id": f["areaorigen_id"], "nombre": f["descripcion"] or f["areaorigen_id"]}
            for f in filas
            if f["areaorigen_id"]
        ]
        return sorted(areas, key=lambda a: a["nombre"])

    return cache.obtener_o_calcular("catalogo:areas", calcular)


def catalogo_almacenes() -> list[dict[str, str]]:
    def calcular() -> list[dict[str, str]]:
        filas = consultar(
            _openquery("SELECT almacen_id, almacen_name FROM almacenes")
        )
        almacenes = [
            {"id": f["almacen_id"], "nombre": f.get("almacen_name") or f["almacen_id"]}
            for f in filas
            if f["almacen_id"]
        ]
        return sorted(almacenes, key=lambda a: a["id"])

    return cache.obtener_o_calcular("catalogo:almacenes", calcular)


def catalogo_unidades() -> dict[str, str]:
    def calcular() -> dict[str, str]:
        filas = consultar(
            _openquery("SELECT unidmedi_id, unidad, unidmedi_name FROM unidades")
        )
        return {
            f["unidmedi_id"]: (f.get("unidad") or f.get("unidmedi_name") or "")
            for f in filas
            if f["unidmedi_id"]
        }

    return cache.obtener_o_calcular("catalogo:unidades", calcular)


def catalogo_familias() -> dict[str, str]:
    def calcular() -> dict[str, str]:
        filas = consultar(
            _openquery("SELECT familia_id, familia_name FROM familias")
        )
        return {f["familia_id"]: f.get("familia_name") or "" for f in filas if f["familia_id"]}

    return cache.obtener_o_calcular("catalogo:familias", calcular)


def catalogo_tipos_producto() -> list[dict[str, Any]]:
    """Tipos de producto con las familias que agrupan, para poder excluirlos.

    No hay catálogo de tipos en el DBC, así que se arma desde `familias`,
    que es donde vive la relación tipo → familia.
    """

    def calcular() -> list[dict[str, Any]]:
        filas = consultar(
            _openquery("SELECT tipoprod_id, familia_id, familia_name FROM familias")
        )
        agrupado: dict[str, list[str]] = {}
        for f in filas:
            tipo = (f["tipoprod_id"] or "").strip()
            if not tipo:
                continue
            agrupado.setdefault(tipo, []).append(
                (f.get("familia_name") or f["familia_id"] or "").strip()
            )
        return [
            {"id": tipo, "familias": sorted(familias), "nombre": " · ".join(sorted(familias))}
            for tipo, familias in sorted(agrupado.items())
        ]

    return cache.obtener_o_calcular("catalogo:tipos_producto", calcular)


def catalogo_usuarios() -> list[dict[str, str]]:
    """Usuarios que han pedido algo, no la tabla completa de usuarios."""

    def calcular() -> list[dict[str, str]]:
        try:
            filas = consultar(
                _openquery("SELECT usuario_id, usuario_name FROM usuarios")
            )
            return sorted(
                (
                    {"id": f["usuario_id"], "nombre": f.get("usuario_name") or f["usuario_id"]}
                    for f in filas
                    if f["usuario_id"]
                ),
                key=lambda u: u["id"],
            )
        except Exception:  # la tabla puede no ser legible para el usuario lector
            return []

    return cache.obtener_o_calcular("catalogo:usuarios", calcular)
