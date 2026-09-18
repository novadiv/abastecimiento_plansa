"""
Verificación del backend sin levantar el servidor.

    .venv\\Scripts\\python.exe verificar.py

Comprueba, en este orden: que el .env se lee, que el guardián de solo
lectura bloquea escrituras, que hay conexión con SQL Server y con el
puente FoxPro, y que las consultas del dominio devuelven datos reales.
"""

from __future__ import annotations

import sys
import time
from datetime import date

from app import queries, service
from app.config import get_settings
from app.db import SentenciaNoPermitida, probar_conexion, verificar_solo_lectura

VERDE, ROJO, GRIS, FIN = "\033[92m", "\033[91m", "\033[90m", "\033[0m"
fallos = 0


def prueba(titulo: str):
    def decorador(funcion):
        global fallos
        inicio = time.perf_counter()
        try:
            detalle = funcion()
            print(f"{VERDE}  OK  {FIN} {titulo} {GRIS}({time.perf_counter() - inicio:.1f}s){FIN}")
            if detalle:
                for linea in str(detalle).splitlines():
                    print(f"        {GRIS}{linea}{FIN}")
        except Exception as exc:  # noqa: BLE001 — es un script de diagnóstico
            fallos += 1
            print(f"{ROJO} FALLA{FIN} {titulo}")
            print(f"        {ROJO}{exc}{FIN}")
        return funcion

    return decorador


print("\n─── Configuración ───────────────────────────────────────────")


@prueba("Se lee el .env de la raíz")
def _config():
    ajustes = get_settings()
    resumen = ajustes.resumen_seguro()
    if not resumen["env_encontrado"]:
        raise RuntimeError(f"No existe el archivo {resumen['archivo_env']}")
    if not ajustes.db_user:
        raise RuntimeError("DB_USER está vacío en el .env")
    return (
        f"servidor={resumen['servidor']}  base={resumen['base_datos']}\n"
        f"usuario={resumen['usuario']}  solo_lectura={resumen['solo_lectura']}"
    )


print("\n─── Barrera de solo lectura ─────────────────────────────────")


@prueba("Se bloquean INSERT, UPDATE, DELETE, DROP y demás escrituras")
def _bloqueo():
    peligrosas = [
        "INSERT INTO productos VALUES (1)",
        "UPDATE cabecera SET estado = 'X'",
        "DELETE FROM detalle",
        "DROP TABLE productos",
        "TRUNCATE TABLE detalle",
        "SELECT 1; DELETE FROM detalle",
        "SELECT * INTO copia FROM productos",
        "EXEC sp_who",
        "-- comentario\nDELETE FROM detalle",
    ]
    for sentencia in peligrosas:
        try:
            verificar_solo_lectura(sentencia)
        except SentenciaNoPermitida:
            continue
        raise RuntimeError(f"NO se bloqueó: {sentencia!r}")
    verificar_solo_lectura("SELECT * FROM productos")  # esta sí debe pasar
    return f"{len(peligrosas)} sentencias de escritura rechazadas; SELECT permitido"


print("\n─── Conexión ────────────────────────────────────────────────")


@prueba("SQL Server responde y el puente FoxPro está accesible")
def _conexion():
    info = probar_conexion()
    if not info.get("foxpro"):
        raise RuntimeError("SQL Server responde pero el servidor vinculado FOX no")
    return f"login={info['login']}  base={info['base']}\n{info['version']}"


print("\n─── Catálogos ───────────────────────────────────────────────")


@prueba("Áreas, almacenes y unidades")
def _catalogos():
    areas = queries.catalogo_areas()
    almacenes = queries.catalogo_almacenes()
    unidades = queries.catalogo_unidades()
    if not areas:
        raise RuntimeError("No se leyó ningún área")
    return f"{len(areas)} áreas, {len(almacenes)} almacenes, {len(unidades)} unidades"


@prueba("Maestro de productos y stock actual")
def _maestro():
    maestro = queries.maestro_productos()
    stock = queries.stock_actual()
    if len(maestro) < 1000:
        raise RuntimeError(f"Solo {len(maestro)} productos; se esperaban más de 20.000")
    return f"{len(maestro)} artículos en el maestro, {len(stock)} con registro de stock"


print("\n─── Consolidado del mes en curso ────────────────────────────")

hoy = date.today()
inicio_mes = date(hoy.year, hoy.month, 1)


@prueba(f"Consolidado {inicio_mes} → {hoy}")
def _consolidado():
    resultado = service.construir_consolidado(desde=inicio_mes, hasta=hoy)
    resumen = resultado["resumen"]
    if not resultado["items"]:
        raise RuntimeError("El consolidado salió vacío")

    lineas = [
        f"{resumen['productos']} productos, {resumen['documentos']} requerimientos, "
        f"{resumen['lineas']} líneas",
        f"por comprar: {resumen['productos_por_comprar']}  "
        f"importe estimado: S/ {resumen['importe_estimado']:,.2f}",
        f"críticos={resumen['criticos']} urgentes={resumen['urgentes']} "
        f"atención={resumen['atencion']} ok={resumen['ok']}",
        "",
        f"{'CODIGO':<10} {'DESCRIPCION':<38} {'SOLIC':>9} {'ATEND':>9} {'PEND':>9} {'STOCK':>9} {'SUGER':>9}",
    ]
    for item in resultado["items"][:8]:
        lineas.append(
            f"{item['codigo']:<10} {item['descripcion'][:38]:<38} "
            f"{item['solicitado']:>9,.0f} {item['atendido']:>9,.0f} "
            f"{item['pendiente']:>9,.0f} {item['stock_actual']:>9,.0f} "
            f"{item['sugerido_comprar']:>9,.0f}"
        )
    globals()["_primer_codigo"] = resultado["items"][0]["codigo"]
    return "\n".join(lineas)


print("\n─── Detalle e historial de un producto ──────────────────────")


@prueba("Ver detalles: requerimientos que componen el total")
def _detalle():
    codigo = globals().get("_primer_codigo")
    if not codigo:
        raise RuntimeError("No hay producto de referencia (falló el consolidado)")
    detalle = service.detalle_de_producto(codigo, inicio_mes, hoy)
    lineas = [
        f"{codigo} — {detalle['descripcion']}",
        f"solicitado={detalle['total_solicitado']:,.0f} "
        f"atendido={detalle['total_atendido']:,.0f} "
        f"pendiente={detalle['total_pendiente']:,.0f}",
        f"{len(detalle['requerimientos'])} requerimientos, "
        f"{detalle['con_referencia']} con texto de referencia",
        "",
        f"{'DOCUMENTO':<16} {'FECHA':<11} {'USUARIO':<12} {'AREA':<22} {'CANT':>8}  REFERENCIA",
    ]
    for r in detalle["requerimientos"][:6]:
        lineas.append(
            f"{r['documento']:<16} {str(r['fecha']):<11} {r['usuario']:<12} "
            f"{r['area'][:22]:<22} {r['cantidad']:>8,.0f}  {r['referencia'][:30]}"
        )
    return "\n".join(lineas)


@prueba("Historial mensual para la gráfica")
def _historial():
    codigo = globals().get("_primer_codigo")
    if not codigo:
        raise RuntimeError("No hay producto de referencia")
    historial = service.historial_de_producto(codigo, date(hoy.year, 1, 1), hoy)
    lineas = [
        f"{codigo} — {historial['descripcion']}",
        f"comprado={historial['totales']['comprado']:,.0f} "
        f"consumido={historial['totales']['consumido']:,.0f} "
        f"veces={historial['totales']['veces_comprado']}",
        "",
        f"{'MES':<9} {'COMPRAS':>10} {'CONSUMO':>10} {'PEDIDOS':>10}",
    ]
    for mes in historial["serie_mensual"]:
        lineas.append(
            f"{mes['mes']:<9} {mes['compras']:>10,.0f} "
            f"{mes['consumo']:>10,.0f} {mes['requerimientos']:>10,.0f}"
        )
    return "\n".join(lineas)


print()
if fallos:
    print(f"{ROJO}Verificación terminada con {fallos} fallo(s).{FIN}\n")
    sys.exit(1)
print(f"{VERDE}Todo correcto. El backend puede arrancar.{FIN}\n")
