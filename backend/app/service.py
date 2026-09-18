"""
Lógica de negocio del plan de abastecimiento.

Combina lo que piden las áreas (requerimientos de almacén), lo que ya se
despachó, lo que hay en stock y el ritmo histórico, para responder a una
sola pregunta: **qué hay que comprar hoy, y cuánto, para no quebrar stock
ni comprar de más.**
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any, Literal

from . import compradores as mod_compradores
from . import queries, vfp
from .config import get_settings

# Promedio de días por mes: 365,25 / 12. Evita que un periodo de 31 días
# cuente como "un mes" y otro de 28 también.
DIAS_POR_MES = 30.44

BaseConsumo = Literal["compras", "consumo", "requerimientos", "ordenes"]

ETIQUETA_BASE = {
    "compras": "Compras reales (ingresos 011)",
    "consumo": "Consumo de almacén (salidas 009)",
    "requerimientos": "Demanda solicitada (requerimientos 058)",
    "ordenes": "Órdenes de compra a proveedor",
}

# De dónde sale cada base, para poder ir a comprobarla al ERP documento a
# documento. Se muestra en la pantalla de sustento.
FUENTE_BASE = {
    "compras": "Partes de ingreso de compra local (documento 011)",
    "consumo": "Salidas internas de almacén (documento 009)",
    "requerimientos": "Requerimientos de almacén (documento 058)",
    "ordenes": "Órdenes de compra (tablas pedidoscab / pedidosdet)",
}


def _meses_del_periodo(desde: date, hasta: date) -> float:
    """Duración del periodo en meses, nunca menor que medio mes.

    El mínimo evita que un filtro de un solo día proyecte un ritmo mensual
    absurdo (pedir 40 unidades en un día no significa 1.200 al mes).
    """
    dias = (hasta - desde).days + 1
    return max(dias / DIAS_POR_MES, 0.5)


def _clasificar(cobertura_meses: float | None, meses_objetivo: float) -> str:
    """Semáforo de urgencia según cuánto dura el stock actual."""
    if cobertura_meses is None:
        return "sin-consumo"
    if cobertura_meses <= 0:
        return "critico"
    if cobertura_meses < meses_objetivo * 0.5:
        return "urgente"
    if cobertura_meses < meses_objetivo:
        return "atencion"
    return "ok"


def construir_consolidado(
    desde: date,
    hasta: date,
    area: str | None = None,
    usuario: str | None = None,
    almacen: str | None = None,
    base_consumo: BaseConsumo = "compras",
    meses_cobertura: float | None = None,
    solo_por_comprar: bool = False,
    incluir_pendiente: bool = False,
    comprador: str | None = None,
) -> dict[str, Any]:
    """Consolida por producto todos los requerimientos del periodo.

    `incluir_pendiente` suma al pedido lo que quedó sin atender. Sin él, la
    sugerencia cubre solo el consumo previsto de los próximos meses; con él,
    cubre además el atraso acumulado. La diferencia importa: hay artículos
    con 122.000 unidades pendientes y un ritmo de compra de 21.000 al mes.
    """
    ajustes = get_settings()
    objetivo = meses_cobertura or float(ajustes.cobertura_meses_defecto)
    hoy = date.today()

    solicitado = queries.consolidado_solicitado(desde, hasta, area, usuario, almacen)
    atendido = queries.consolidado_atendido(desde, hasta, area, usuario, almacen)
    stock = queries.stock_actual()
    maestro = queries.maestro_productos()
    unidades = queries.catalogo_unidades()
    familias = queries.catalogo_familias()

    # Base elegida por el usuario para estimar el ritmo. Se ofrecen las tres
    # porque el consumo que registra el almacén no siempre es de fiar y
    # conviene poder contrastarlo contra lo que de verdad se compró.
    compras = queries.compras_por_producto(desde, hasta)
    ordenes = queries.ordenes_por_producto(desde, hasta)
    en_camino = queries.en_camino_por_producto()
    maestro_compradores = mod_compradores.maestro()["asignacion"]

    if base_consumo == "consumo":
        historico = queries.consumo_por_producto(desde, hasta)
    elif base_consumo == "requerimientos":
        historico = {f["producto_id"]: float(f["solicitado"] or 0) for f in solicitado}
    elif base_consumo == "ordenes":
        historico = {pid: datos["cantidad"] for pid, datos in ordenes.items()}
    else:
        historico = {pid: datos["cantidad"] for pid, datos in compras.items()}

    meses_periodo = _meses_del_periodo(desde, hasta)
    items: list[dict[str, Any]] = []

    for fila in solicitado:
        pid = fila["producto_id"]
        ficha = maestro.get(pid, {})
        info_stock = stock.get(pid, {})

        cant_solicitada = float(fila["solicitado"] or 0)
        cant_atendida = atendido.get(pid, 0.0)
        cant_pendiente = max(0.0, cant_solicitada - cant_atendida)
        stock_actual = float(info_stock.get("stock", 0.0))

        movido = historico.get(pid, 0.0)
        ritmo_mensual = movido / meses_periodo if movido > 0 else 0.0

        # Un saldo negativo no es inventario: es un kardex descuadrado (se
        # despachó sin registrar el ingreso). Tomarlo tal cual dispararía la
        # sugerencia — un servicio con saldo -152.000 pediría comprar
        # 152.000 unidades. Se cuenta como cero y se marca la anomalía para
        # que quien compre sepa que ese dato no es de fiar.
        stock_negativo = stock_actual < 0
        stock_disponible = max(0.0, stock_actual)

        if ritmo_mensual > 0:
            cobertura = stock_disponible / ritmo_mensual
            fecha_quiebre = hoy + timedelta(days=int(cobertura * DIAS_POR_MES))
        else:
            cobertura = None
            fecha_quiebre = None

        # Cuánto pedir: cubrir el objetivo de meses descontando lo que ya
        # hay en almacén. Por defecto el pendiente NO se suma, porque la
        # demanda del periodo ya está reflejada en el ritmo y contarla otra
        # vez inflaría el pedido. Quien compra puede activarlo cuando quiera
        # cubrir además el atraso acumulado.
        necesidad = ritmo_mensual * objetivo
        if incluir_pendiente:
            necesidad += cant_pendiente

        # Lo ya pedido al proveedor y aún sin llegar cuenta como si estuviera
        # en almacén: si no se descuenta, se compra dos veces lo mismo. Caso
        # real medido: el sistema sugería comprar 19 cajas de un artículo que
        # ya tenía 12 pedidas y en tránsito.
        viene = float(en_camino.get(pid, 0.0))
        sugerido = max(0.0, necesidad - stock_disponible - viene)

        datos_compra = compras.get(pid, {})
        costo_unitario = float(ficha.get("costo_referencia", 0.0))
        if datos_compra.get("cantidad"):
            # Costo real promedio del periodo, mejor referencia que el del maestro.
            costo_unitario = datos_compra["importe"] / datos_compra["cantidad"] or costo_unitario

        items.append(
            {
                "codigo": pid,
                "descripcion": ficha.get("descripcion") or "(sin descripción en el maestro)",
                "unidad": unidades.get(ficha.get("unidad_id", ""), ""),
                "familia": familias.get(ficha.get("familia_id", ""), ""),
                "activo": ficha.get("activo", False),
                # Reparto interno de códigos, deducido de quién emitió las
                # órdenes de compra: el ERP no guarda a quién le toca cada uno.
                "comprador": maestro_compradores.get(pid, {}).get("comprador", ""),
                "comprador_confianza": maestro_compradores.get(pid, {}).get("confianza", "sin-datos"),
                "comprador_origen": maestro_compradores.get(pid, {}).get("origen", ""),
                # Consolidado de requerimientos
                "solicitado": round(cant_solicitada, 3),
                "atendido": round(cant_atendida, 3),
                "pendiente": round(cant_pendiente, 3),
                "pendiente_erp": round(float(fila["pendiente_erp"] or 0), 3),
                "lineas": int(fila["lineas"] or 0),
                "documentos": int(fila["documentos"] or 0),
                "primera_fecha": fila["primera_fecha"],
                "ultima_fecha": fila["ultima_fecha"],
                # Situación de stock
                "stock_actual": round(stock_actual, 3),
                "stock_negativo": stock_negativo,
                "stock_minimo": ficha.get("stock_minimo", 0.0),
                "stock_ultimo_movimiento": info_stock.get("ultima_fecha"),
                # Pedido al proveedor y todavía sin llegar. La cobertura NO lo
                # cuenta a propósito: "se agota" responde a qué pasa si no
                # llega nada, que es el escenario que hay que vigilar.
                "en_camino": round(viene, 3),
                # Ritmo y proyección
                "base_consumo": base_consumo,
                "cantidad_base": round(movido, 3),
                "ritmo_mensual": round(ritmo_mensual, 3),
                "cobertura_meses": round(cobertura, 2) if cobertura is not None else None,
                "fecha_quiebre": fecha_quiebre,
                "meses_objetivo": objetivo,
                "sugerido_comprar": round(sugerido, 3),
                "costo_unitario": round(costo_unitario, 4),
                "importe_estimado": round(sugerido * costo_unitario, 2),
                "estado": _clasificar(cobertura, objetivo),
                # Compras del periodo, para contrastar
                "comprado_periodo": round(float(datos_compra.get("cantidad", 0)), 3),
                "veces_comprado": int(datos_compra.get("veces", 0)),
                "ultima_compra": datos_compra.get("ultima_compra"),
                # Órdenes puestas al proveedor en el periodo
                "ordenado_periodo": round(float(ordenes.get(pid, {}).get("cantidad", 0)), 3),
                "ordenes_periodo": int(ordenes.get(pid, {}).get("lineas", 0)),
                "ultima_orden": ordenes.get(pid, {}).get("ultima_orden"),
            }
        )

    # El resumen se calcula sobre TODO el universo, antes de filtrar: si se
    # contara solo lo filtrado, activar "solo por comprar" dejaría el
    # semáforo en 0 artículos correctos y parecería que nada está sano.
    # El filtro por comprador se aplica antes del resumen: cuando alguien
    # entra a ver "lo mío", las cifras de cabecera tienen que ser las suyas,
    # no las de toda la empresa.
    if comprador:
        objetivo_comprador = comprador.strip().upper()
        items = [i for i in items if i["comprador"] == objetivo_comprador]

    resumen = _resumen(items, desde, hasta, base_consumo, objetivo, meses_periodo)
    resumen["incluir_pendiente"] = incluir_pendiente
    resumen["comprador"] = (comprador or "").strip().upper()

    if solo_por_comprar:
        items = [i for i in items if i["sugerido_comprar"] > 0]
    resumen["mostrados"] = len(items)

    items.sort(key=lambda i: i["importe_estimado"], reverse=True)

    return {"items": items, "resumen": resumen}


def _resumen(
    items: list[dict[str, Any]],
    desde: date,
    hasta: date,
    base_consumo: str,
    objetivo: float,
    meses_periodo: float,
) -> dict[str, Any]:
    por_comprar = [i for i in items if i["sugerido_comprar"] > 0]
    return {
        "desde": desde,
        "hasta": hasta,
        "meses_periodo": round(meses_periodo, 2),
        "meses_objetivo": objetivo,
        "base_consumo": base_consumo,
        "base_consumo_etiqueta": ETIQUETA_BASE.get(base_consumo, base_consumo),
        "productos": len(items),
        "productos_por_comprar": len(por_comprar),
        "documentos": sum(i["documentos"] for i in items),
        "lineas": sum(i["lineas"] for i in items),
        "importe_estimado": round(sum(i["importe_estimado"] for i in por_comprar), 2),
        "stock_negativo": sum(1 for i in items if i["stock_negativo"]),
        "con_pedido_en_camino": sum(1 for i in items if i["en_camino"] > 0),
        "criticos": sum(1 for i in items if i["estado"] == "critico"),
        "urgentes": sum(1 for i in items if i["estado"] == "urgente"),
        "atencion": sum(1 for i in items if i["estado"] == "atencion"),
        "ok": sum(1 for i in items if i["estado"] == "ok"),
        "sin_consumo": sum(1 for i in items if i["estado"] == "sin-consumo"),
    }


def detalle_de_producto(
    producto_id: str,
    desde: date,
    hasta: date,
    area: str | None = None,
    usuario: str | None = None,
    almacen: str | None = None,
) -> dict[str, Any]:
    """Los requerimientos uno por uno que explican el total consolidado.

    Responde a "¿de dónde salen estas 300 unidades?". Incluye todo el
    contexto disponible porque los campos de glosa están vacíos en toda la
    base: ni un solo requerimiento de 2026 tiene glosa de cabecera ni de
    detalle. El texto libre que sí existe es `referencia`, en torno al 9 %
    de las líneas.
    """
    filas = queries.detalle_requerimientos_de_producto(
        producto_id, desde, hasta, area, usuario, almacen
    )
    despachado = queries.atendido_por_requerimiento(producto_id, desde, hasta)
    maestro = queries.maestro_productos()
    areas = {a["id"]: a["nombre"] for a in queries.catalogo_areas()}
    usuarios = {u["id"]: u["nombre"] for u in queries.catalogo_usuarios()}
    ficha = maestro.get(producto_id, {})

    # Lo despachado viene por documento, no por línea. Cuando un documento
    # tiene varias líneas del mismo producto se reparte a prorrata, y se
    # marca como aproximado para no dar una precisión que no existe.
    lineas_por_documento: dict[str, int] = {}
    for f in filas:
        clave = f"{f['docuserie']}-{f['docunum']}"
        lineas_por_documento[clave] = lineas_por_documento.get(clave, 0) + 1

    requerimientos = []
    for f in filas:
        clave = f"{f['docuserie']}-{f['docunum']}"
        repeticiones = lineas_por_documento[clave]
        atendido_doc = despachado.get(clave, 0.0)
        atendido_linea = atendido_doc / repeticiones if repeticiones else atendido_doc
        cantidad = float(f["cantidad"] or 0)

        ot = ""
        if f["docref_id"] and str(f["docref_id"]).strip():
            ot = f"{f['docref_id']}-{f['docrefserie']}-{f['docrefnum']}"

        requerimientos.append(
            {
                "documento": f"{f['docuserie']}-{f['docunum']}",
                "serie": f["docuserie"],
                "numero": f["docunum"],
                "item": int(f["item"] or 0),
                "fecha": f["fecdocumen"],
                "usuario": f["usuario_id"],
                "usuario_nombre": usuarios.get(f["usuario_id"], f["usuario_id"]),
                "area_id": f["areaorigen_id"],
                "area": areas.get(f["areaorigen_id"], f["areaorigen_id"] or "(sin área)"),
                "centro_costo": f["ccosto_id"],
                "almacen": f["almacen_id"],
                "cantidad": round(cantidad, 3),
                "atendido": round(atendido_linea, 3),
                "pendiente": round(max(0.0, cantidad - atendido_linea), 3),
                "pendiente_erp": round(float(f["cant_pend"] or 0), 3),
                "atendido_aproximado": repeticiones > 1,
                # Único texto libre con contenido real en esta base.
                "referencia": f["referencia"] or "",
                "orden_trabajo": ot,
                "estado": f["estado"],
                "estado2": f["estado2"],
                "aprobado": (f["flagaprobar"] or "").strip().upper() == "S",
                "usuario_aprueba": f["usuarioaprob"] or "",
                "fecha_aprobacion": _fecha_valida(f["fechaaprob"]),
                "fecha_entrega": _fecha_valida(f["fechaentrega"]),
            }
        )

    total = sum(r["cantidad"] for r in requerimientos)
    total_atendido = sum(r["atendido"] for r in requerimientos)

    return {
        "codigo": producto_id,
        "descripcion": ficha.get("descripcion", ""),
        "unidad": queries.catalogo_unidades().get(ficha.get("unidad_id", ""), ""),
        "total_solicitado": round(total, 3),
        "total_atendido": round(total_atendido, 3),
        "total_pendiente": round(max(0.0, total - total_atendido), 3),
        "con_referencia": sum(1 for r in requerimientos if r["referencia"]),
        "requerimientos": requerimientos,
    }


def _fecha_valida(valor: Any) -> Any:
    """Descarta la fecha vacía de FoxPro (1899-12-30) y otras imposibles."""
    if valor is None:
        return None
    anio = getattr(valor, "year", None)
    if anio is None or anio < 1990 or anio > 2100:
        return None
    return valor


def sustento_de_producto(
    producto_id: str,
    desde: date,
    hasta: date,
    base_consumo: BaseConsumo = "compras",
    meses_cobertura: float | None = None,
) -> dict[str, Any]:
    """La demostración del número: de dónde sale el ritmo mensual.

    Existe para poder defender la cifra ante alguien que no se fía de ella.
    Devuelve la aritmética completa —total, meses, división—, el desglose mes
    a mes con las cuatro bases lado a lado, la dispersión del consumo y la
    lista de documentos concretos que suman ese total, para que cualquiera
    pueda ir al ERP y comprobarlos uno por uno.
    """
    ajustes = get_settings()
    objetivo = meses_cobertura or float(ajustes.cobertura_meses_defecto)

    movimientos = queries.movimientos_producto(producto_id, desde, hasta)
    ordenes = queries.ordenes_de_producto(producto_id, desde, hasta)
    maestro = queries.maestro_productos()
    ficha = maestro.get(producto_id, {})
    info_stock = queries.stock_actual().get(producto_id, {})
    en_camino = float(queries.en_camino_por_producto().get(producto_id, 0.0))

    # ── Desglose mensual con las cuatro bases ─────────────────────────
    meses: dict[str, dict[str, Any]] = {}

    def casilla(fecha: Any) -> dict[str, Any] | None:
        if not fecha or getattr(fecha, "year", 0) < 1990:
            return None
        clave = f"{fecha.year:04d}-{fecha.month:02d}"
        return meses.setdefault(
            clave,
            {
                "mes": clave,
                "compras": 0.0,
                "consumo": 0.0,
                "requerimientos": 0.0,
                "ordenes": 0.0,
                "importe": 0.0,
                "documentos": [],
            },
        )

    for mov in movimientos:
        celda = casilla(mov["fecregistro"])
        if celda is None:
            continue
        cantidad = float(mov["cantidad"] or 0)
        tipo = (mov["docu_id"] or "").strip()
        etiqueta = {
            vfp.INGRESO_COMPRA: "compras",
            vfp.SALIDA_INTERNA: "consumo",
            vfp.REQUERIMIENTO_ALMACEN: "requerimientos",
        }.get(tipo)
        if not etiqueta:
            continue
        celda[etiqueta] += cantidad
        if etiqueta == "compras":
            celda["importe"] += float(mov["costototalmn"] or 0)
        celda["documentos"].append(
            {
                "tipo": etiqueta,
                "documento": f"{mov['docuserie']}-{mov['docunum']}",
                "fecha": mov["fecregistro"],
                "cantidad": round(cantidad, 3),
            }
        )

    for orden in ordenes:
        celda = casilla(orden["fecha"])
        if celda is None:
            continue
        celda["ordenes"] += orden["cantidad"]
        celda["documentos"].append(
            {
                "tipo": "ordenes",
                "documento": f"OC {orden['documento']}",
                "fecha": orden["fecha"],
                "cantidad": orden["cantidad"],
            }
        )

    # Un mes partido por el filtro no es comparable con uno completo: en la
    # ventana 14/09 a 14/09 los dos septiembres están cortados. Se marcan
    # para excluirlos de la dispersión y que la media no salga deprimida.
    serie = []
    for clave in sorted(meses):
        celda = meses[clave]
        anio, mes = int(clave[:4]), int(clave[5:])
        primero = date(anio, mes, 1)
        ultimo = date(anio + (mes // 12), (mes % 12) + 1, 1) - timedelta(days=1)
        celda["completo"] = primero >= desde and ultimo <= hasta
        celda["documentos"].sort(key=lambda d: (d["fecha"], d["documento"]))
        for campo in ("compras", "consumo", "requerimientos", "ordenes", "importe"):
            celda[campo] = round(celda[campo], 3)
        serie.append(celda)

    totales = {
        campo: round(sum(m[campo] for m in serie), 3)
        for campo in ("compras", "consumo", "requerimientos", "ordenes", "importe")
    }

    # ── La aritmética del ritmo ───────────────────────────────────────
    dias = (hasta - desde).days + 1
    meses_periodo = _meses_del_periodo(desde, hasta)
    total_base = totales.get(base_consumo, 0.0)
    ritmo = total_base / meses_periodo if meses_periodo else 0.0

    stock_actual = float(info_stock.get("stock", 0.0))
    stock_disponible = max(0.0, stock_actual)
    necesidad = ritmo * objetivo
    sugerido = max(0.0, necesidad - stock_disponible - en_camino)

    # ── Dispersión, solo sobre meses completos ────────────────────────
    valores = [m[base_consumo] for m in serie if m["completo"]]
    estadistica: dict[str, Any] = {
        "meses_completos": len(valores),
        "minimo": round(min(valores), 3) if valores else None,
        "maximo": round(max(valores), 3) if valores else None,
        "promedio": round(sum(valores) / len(valores), 3) if valores else None,
        "desviacion": None,
        "variabilidad_pct": None,
        "estabilidad": "sin-datos",
    }
    if len(valores) >= 2:
        promedio = sum(valores) / len(valores)
        varianza = sum((v - promedio) ** 2 for v in valores) / len(valores)
        desviacion = varianza ** 0.5
        estadistica["desviacion"] = round(desviacion, 3)
        if promedio > 0:
            cv = desviacion / promedio * 100
            estadistica["variabilidad_pct"] = round(cv, 1)
            # Umbrales habituales de clasificación XYZ en gestión de stocks.
            estadistica["estabilidad"] = (
                "estable" if cv < 25 else "variable" if cv < 50 else "erratico"
            )

    comparacion = [
        {
            "base": clave,
            "etiqueta": ETIQUETA_BASE[clave],
            "fuente": FUENTE_BASE[clave],
            "total": totales.get(clave, 0.0),
            "ritmo_mensual": round(totales.get(clave, 0.0) / meses_periodo, 3)
            if meses_periodo
            else 0.0,
            "seleccionada": clave == base_consumo,
        }
        for clave in ("compras", "consumo", "requerimientos", "ordenes")
    ]

    pendientes_de_llegar = [o for o in ordenes if o["pendiente"] > 0]

    return {
        "codigo": producto_id,
        "descripcion": ficha.get("descripcion", ""),
        "unidad": queries.catalogo_unidades().get(ficha.get("unidad_id", ""), ""),
        "periodo": {
            "desde": desde,
            "hasta": hasta,
            "dias": dias,
            "meses": round(meses_periodo, 2),
        },
        "base": {
            "id": base_consumo,
            "etiqueta": ETIQUETA_BASE[base_consumo],
            "fuente": FUENTE_BASE[base_consumo],
        },
        # El cálculo, paso a paso, para poder rehacerlo a mano.
        "calculo": {
            "total_periodo": round(total_base, 3),
            "meses_periodo": round(meses_periodo, 2),
            "ritmo_mensual": round(ritmo, 3),
            "meses_objetivo": objetivo,
            "necesidad": round(necesidad, 3),
            "stock_actual": round(stock_actual, 3),
            "en_camino": round(en_camino, 3),
            "sugerido_comprar": round(sugerido, 3),
            "formula": (
                f"({round(total_base, 2):g} ÷ {round(meses_periodo, 2):g} meses) "
                f"× {objetivo:g} meses − {round(stock_disponible, 2):g} de stock "
                f"− {round(en_camino, 2):g} en camino = {round(sugerido, 2):g}"
            ),
        },
        "serie_mensual": serie,
        "totales": totales,
        "estadistica": estadistica,
        "comparacion_bases": comparacion,
        "ordenes": ordenes,
        "ordenes_pendientes": pendientes_de_llegar,
        "total_en_camino": round(sum(o["pendiente"] for o in pendientes_de_llegar), 3),
        "stock_ultimo_movimiento": info_stock.get("ultima_fecha"),
    }


# ──────────────────────────────────────────────────────────────────────
#  Plan de órdenes: qué girar, a quién, y cada cuánto
# ──────────────────────────────────────────────────────────────────────

# Ciclos practicables. No se ofrece nada más corto que un mes: comprarle
# al mismo proveedor dos veces en el mismo mes es justo lo que se quiere
# eliminar.
CICLOS_PRACTICOS = (1, 2, 3, 6, 12)

# Percentil 90 medido del plazo real entre la orden y el ingreso.
DIAS_PLAZO_ENTREGA = 10

# Margen sobre el stock objetivo, en meses de consumo.
MARGEN_SEGURIDAD_MESES = 0.25


def _clasificar_urgencia(dias: float) -> str:
    if dias <= 0:
        return "sin-stock"
    if dias <= 7:
        return "esta-semana"
    if dias <= 15:
        return "quince-dias"
    if dias <= 30:
        return "treinta-dias"
    return "holgado"


def plan_de_ordenes(
    desde: date,
    hasta: date,
    base_consumo: BaseConsumo = "compras",
    meses_cobertura: float | None = None,
    comprador: str | None = None,
    excluir_tipos: tuple[str, ...] = (),
    costo_orden: float = 45.0,
    tasa_almacen: float = 0.22,
) -> dict[str, Any]:
    """Agrupa lo que hay que comprar en una orden por proveedor.

    El número de órdenes no lo fija cuántos códigos se compran, sino a
    cuántos proveedores se les compra. Por eso el ciclo se calcula sobre el
    valor anual de cada PROVEEDOR: una orden cubre todo lo que se le pida
    ese día, así que el costo de emitirla se paga una vez por visita, no
    por línea.

    El ciclo sale del lote económico clásico, reordenado en tiempo:

        T* (años) = raíz( 2 · costo_orden / (valor_anual · tasa_almacén) )

    y se redondea al ciclo practicable más cercano.
    """
    ajustes = get_settings()
    objetivo = meses_cobertura or float(ajustes.cobertura_meses_defecto)

    consolidado = construir_consolidado(
        desde=desde,
        hasta=hasta,
        base_consumo=base_consumo,
        meses_cobertura=objetivo,
        solo_por_comprar=True,
        comprador=comprador,
    )
    maestro = queries.maestro_productos()
    referencia = queries.proveedor_de_referencia(date(desde.year - 1, desde.month, 1))
    consumo_anual = queries.consumo_anual_por_producto(desde, hasta)
    meses_periodo = _meses_del_periodo(desde, hasta)

    excluidos: dict[str, dict[str, Any]] = {}
    grupos: dict[str, dict[str, Any]] = {}
    sin_proveedor: list[dict[str, Any]] = []

    for item in consolidado["items"]:
        ficha = maestro.get(item["codigo"], {})
        tipo = ficha.get("tipoprod_id", "")
        if tipo and tipo in excluir_tipos:
            celda = excluidos.setdefault(
                item["familia"] or f"tipo {tipo}", {"familia": item["familia"], "codigos": 0, "importe": 0.0}
            )
            celda["codigos"] += 1
            celda["importe"] += item["importe_estimado"]
            continue

        info = referencia.get(item["codigo"])
        # Cuántos días aguanta lo que hay, contando lo que ya viene en camino.
        disponible = max(0.0, item["stock_actual"]) + item["en_camino"]
        ritmo = item["ritmo_mensual"] or 0
        dias = (disponible / ritmo * DIAS_POR_MES) if ritmo > 0 else float("inf")

        linea = {
            "codigo": item["codigo"],
            "descripcion": item["descripcion"],
            "unidad": item["unidad"],
            "familia": item["familia"],
            "comprador": item["comprador"],
            "stock_actual": item["stock_actual"],
            "en_camino": item["en_camino"],
            "ritmo_mensual": item["ritmo_mensual"],
            "pendiente": item["pendiente"],
            "cantidad": item["sugerido_comprar"],
            "dias_restantes": None if dias == float("inf") else round(dias, 1),
            "urgencia": _clasificar_urgencia(dias),
            "estado": item["estado"],
            "precio": round(info["precio"], 4) if info else item["costo_unitario"],
            "consumo_anual": round(consumo_anual.get(item["codigo"], 0.0), 3),
        }
        linea["importe"] = round(linea["cantidad"] * (linea["precio"] or 0), 2)

        if not info:
            sin_proveedor.append(linea)
            continue

        grupo = grupos.setdefault(
            info["proveedor_id"],
            {
                "proveedor_id": info["proveedor_id"],
                "proveedor": info["proveedor"],
                "lineas": [],
                "valor_anual": 0.0,
            },
        )
        grupo["lineas"].append(linea)
        # Valor anual del proveedor: lo que se le consume al año valorizado.
        grupo["valor_anual"] += (
            consumo_anual.get(item["codigo"], 0.0)
            / max(meses_periodo, 0.5)
            * 12
            * (info["precio"] or 0)
        )

    ordenes = []
    for grupo in grupos.values():
        valor = grupo["valor_anual"]
        if valor > 0 and tasa_almacen > 0:
            ciclo_teorico = math.sqrt(2 * costo_orden / (valor * tasa_almacen)) * 12
        else:
            ciclo_teorico = 12.0
        ciclo = min(CICLOS_PRACTICOS, key=lambda c: abs(c - ciclo_teorico))

        lineas = sorted(
            grupo["lineas"],
            key=lambda x: (x["dias_restantes"] is None, x["dias_restantes"] or 0),
        )
        dias_min = next(
            (x["dias_restantes"] for x in lineas if x["dias_restantes"] is not None), None
        )
        # Lo que falta para llegar al stock objetivo de este ciclo.
        meses_objetivo = ciclo / 2 + DIAS_PLAZO_ENTREGA / DIAS_POR_MES + MARGEN_SEGURIDAD_MESES
        inversion = 0.0
        for x in lineas:
            mensual = x["consumo_anual"] / max(meses_periodo, 0.5)
            falta = mensual * meses_objetivo - max(0.0, x["stock_actual"]) - x["en_camino"]
            if falta > 0:
                inversion += falta * (x["precio"] or 0)

        ordenes.append(
            {
                **{k: v for k, v in grupo.items() if k != "lineas"},
                "ciclo_meses": ciclo,
                "ciclo_teorico": round(ciclo_teorico, 2),
                "ordenes_por_anio": round(12 / ciclo, 1),
                "valor_anual": round(valor, 2),
                "lineas": lineas,
                "n_lineas": len(lineas),
                "importe": round(sum(x["importe"] for x in lineas), 2),
                "inversion_colchon": round(inversion, 2),
                "dias_min": dias_min,
                "urgencia": _clasificar_urgencia(dias_min if dias_min is not None else 9999),
                "compradores": sorted({x["comprador"] for x in lineas if x["comprador"]}),
            }
        )

    ordenes.sort(key=lambda o: -o["importe"])

    por_ciclo: dict[int, dict[str, Any]] = {}
    for o in ordenes:
        celda = por_ciclo.setdefault(
            o["ciclo_meses"],
            {"ciclo_meses": o["ciclo_meses"], "proveedores": 0, "codigos": 0,
             "valor_anual": 0.0, "ordenes_anio": 0.0, "inversion": 0.0},
        )
        celda["proveedores"] += 1
        celda["codigos"] += o["n_lineas"]
        celda["valor_anual"] += o["valor_anual"]
        celda["ordenes_anio"] += o["ordenes_por_anio"]
        celda["inversion"] += o["inversion_colchon"]

    ordenes_anio = sum(c["ordenes_anio"] for c in por_ciclo.values())
    inversion_total = sum(c["inversion"] for c in por_ciclo.values())

    urgencias: dict[str, dict[str, Any]] = {}
    for o in ordenes:
        for x in o["lineas"]:
            celda = urgencias.setdefault(x["urgencia"], {"lineas": 0, "importe": 0.0})
            celda["lineas"] += 1
            celda["importe"] += x["importe"]

    return {
        "ordenes": ordenes,
        "sin_proveedor": sin_proveedor,
        "excluidos": sorted(excluidos.values(), key=lambda e: -e["importe"]),
        "por_ciclo": [por_ciclo[c] for c in sorted(por_ciclo)],
        "urgencias": urgencias,
        "resumen": {
            "desde": desde,
            "hasta": hasta,
            "base_consumo": base_consumo,
            "base_consumo_etiqueta": ETIQUETA_BASE.get(base_consumo, base_consumo),
            "meses_objetivo": objetivo,
            "comprador": (comprador or "").strip().upper(),
            "ordenes_a_girar": len(ordenes),
            "lineas": sum(o["n_lineas"] for o in ordenes),
            "importe": round(sum(o["importe"] for o in ordenes), 2),
            "sin_proveedor": len(sin_proveedor),
            "codigos_excluidos": sum(e["codigos"] for e in excluidos.values()),
            "importe_excluido": round(sum(e["importe"] for e in excluidos.values()), 2),
            "ordenes_anio_plan": round(ordenes_anio),
            "ordenes_mes_plan": round(ordenes_anio / 12, 1),
            "inversion_colchon": round(inversion_total, 2),
            "costo_orden": costo_orden,
            "tasa_almacen": tasa_almacen,
            "costo_almacen_anual": round(inversion_total * tasa_almacen, 2),
        },
    }


def proveedores_de_producto(
    producto_id: str,
    desde: date,
    hasta: date,
    cantidad: float | None = None,
) -> dict[str, Any]:
    """A quién comprarle, ordenado por precio.

    Se ordena por el **último precio** pagado, no por el promedio: es el que
    refleja lo que costaría hoy. El promedio y el rango se muestran al lado
    para que se vea si el proveedor es estable o se mueve mucho.

    Limitación honesta: NetComercial **no registra la fecha real de entrega
    frente a la comprometida**, así que no se puede medir quién cumple
    plazos. El ranking es por precio; el plazo de crédito se muestra porque
    sí está, pero no se usa para ordenar.
    """
    lista = queries.proveedores_de_producto(producto_id, desde, hasta)
    maestro = queries.maestro_productos()
    ficha = maestro.get(producto_id, {})

    if not lista:
        return {
            "codigo": producto_id,
            "descripcion": ficha.get("descripcion", ""),
            "unidad": queries.catalogo_unidades().get(ficha.get("unidad_id", ""), ""),
            "cantidad_referencia": cantidad,
            "proveedores": [],
            "sin_historial": True,
            "aviso": (
                "No hay órdenes de compra de este producto en el periodo. "
                "Amplía el rango de fechas o consulta el maestro de proveedores."
            ),
        }

    con_precio = [p for p in lista if p["ultimo_precio"] > 0]
    mejor_precio = min((p["ultimo_precio"] for p in con_precio), default=0.0)
    mas_reciente = max(
        (p["ultima_compra"] for p in lista if p["ultima_compra"]), default=None
    )
    mas_usado = max(lista, key=lambda p: p["unidades"])["proveedor_id"]

    for p in lista:
        p["es_mejor_precio"] = bool(
            mejor_precio and abs(p["ultimo_precio"] - mejor_precio) < 1e-6
        )
        p["es_mas_reciente"] = p["ultima_compra"] == mas_reciente and mas_reciente is not None
        p["es_mas_usado"] = p["proveedor_id"] == mas_usado
        p["costo_estimado"] = (
            round(p["ultimo_precio"] * cantidad, 2) if cantidad and p["ultimo_precio"] else None
        )
        # Cuánto se ahorra frente al más caro, para dimensionar la decisión.
        p["sobrecosto_vs_mejor"] = (
            round(p["ultimo_precio"] - mejor_precio, 4) if mejor_precio else 0.0
        )
        p["sobrecosto_pct"] = (
            round((p["ultimo_precio"] - mejor_precio) / mejor_precio * 100, 1)
            if mejor_precio
            else 0.0
        )

    lista.sort(key=lambda p: (p["ultimo_precio"] <= 0, p["ultimo_precio"]))

    ahorro = None
    if cantidad and len(con_precio) > 1:
        caro = max(p["ultimo_precio"] for p in con_precio)
        ahorro = round((caro - mejor_precio) * cantidad, 2)

    return {
        "codigo": producto_id,
        "descripcion": ficha.get("descripcion", ""),
        "unidad": queries.catalogo_unidades().get(ficha.get("unidad_id", ""), ""),
        "cantidad_referencia": cantidad,
        "proveedores": lista,
        "sin_historial": False,
        "mejor_precio": round(mejor_precio, 4),
        "ahorro_maximo": ahorro,
        "periodo": {"desde": desde, "hasta": hasta},
        "aviso": (
            "Los precios están convertidos a soles con el tipo de cambio de cada "
            "orden. El ranking es por precio: el ERP no registra la fecha real de "
            "entrega, así que no es posible medir qué proveedor cumple mejor los plazos."
        ),
    }


def historial_de_producto(
    producto_id: str, desde: date, hasta: date
) -> dict[str, Any]:
    """Serie mensual de compras, consumo y demanda de un producto.

    Alimenta la gráfica que muestra visualmente cómo se comporta un artículo
    a lo largo del año.
    """
    movimientos = queries.movimientos_producto(producto_id, desde, hasta)
    maestro = queries.maestro_productos()
    ficha = maestro.get(producto_id, {})
    stock = queries.stock_actual().get(producto_id, {})

    meses: dict[str, dict[str, Any]] = {}
    compras_detalle: list[dict[str, Any]] = []

    for mov in movimientos:
        fecha = mov["fecregistro"]
        if not fecha or fecha.year < 1990:
            continue
        clave = f"{fecha.year:04d}-{fecha.month:02d}"
        registro = meses.setdefault(
            clave,
            {"mes": clave, "compras": 0.0, "consumo": 0.0, "requerimientos": 0.0, "importe": 0.0},
        )
        cantidad = float(mov["cantidad"] or 0)
        tipo = (mov["docu_id"] or "").strip()

        if tipo == vfp.INGRESO_COMPRA:
            registro["compras"] += cantidad
            registro["importe"] += float(mov["costototalmn"] or 0)
            compras_detalle.append(
                {
                    "fecha": fecha,
                    "documento": f"{mov['docuserie']}-{mov['docunum']}",
                    "cantidad": round(cantidad, 3),
                    "costo_unitario": round(float(mov["costounitmn"] or 0), 4),
                    "importe": round(float(mov["costototalmn"] or 0), 2),
                    "moneda_compra": "USD" if str(mov["moncompra"]).strip() == "2" else "PEN",
                    "almacen": mov["almacen_id"],
                }
            )
        elif tipo == vfp.SALIDA_INTERNA:
            registro["consumo"] += cantidad
        elif tipo == vfp.REQUERIMIENTO_ALMACEN:
            registro["requerimientos"] += cantidad

    serie = [
        {k: (round(v, 3) if isinstance(v, float) else v) for k, v in mes.items()}
        for mes in sorted(meses.values(), key=lambda m: m["mes"])
    ]
    compras_detalle.sort(key=lambda c: c["fecha"], reverse=True)

    total_compras = sum(m["compras"] for m in serie)
    total_consumo = sum(m["consumo"] for m in serie)
    total_importe = sum(m["importe"] for m in serie)

    return {
        "codigo": producto_id,
        "descripcion": ficha.get("descripcion", ""),
        "unidad": queries.catalogo_unidades().get(ficha.get("unidad_id", ""), ""),
        "stock_actual": round(float(stock.get("stock", 0.0)), 3),
        "stock_minimo": ficha.get("stock_minimo", 0.0),
        "serie_mensual": serie,
        "compras": compras_detalle,
        "totales": {
            "comprado": round(total_compras, 3),
            "consumido": round(total_consumo, 3),
            "solicitado": round(sum(m["requerimientos"] for m in serie), 3),
            "importe": round(total_importe, 2),
            "costo_promedio": round(total_importe / total_compras, 4) if total_compras else 0.0,
            "veces_comprado": len(compras_detalle),
        },
    }
