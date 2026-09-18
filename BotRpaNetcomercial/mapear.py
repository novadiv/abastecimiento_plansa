"""
Mapeo de coordenadas de una pantalla de NetComercial.

CÓMO SE USA
-----------
    python mapear.py --listar              ver las pantallas del catálogo
    python mapear.py oc_cabecera           mapear una pantalla
    python mapear.py --instalar            colocar lo descargado en su sitio

Qué hace `python mapear.py <pantalla>`:

  1. Comprueba la geometría de la pantalla (resolución y escala de Windows)
     y la deja registrada junto a las coordenadas.
  2. Te da unos segundos para pasar a la ventana de NetComercial dentro del
     RDP, y toma una captura.
  3. Genera una página local y la abre en tu navegador. Ahí eliges un campo
     de la lista y haces clic sobre la captura: nada de alt-tabear a una
     consola, que es justo lo que arruina el mapeo dentro de una sesión RDP.
  4. Al terminar, el botón «Guardar perfil» descarga el JSON y el recorte
     del ancla. `python mapear.py --instalar` los mueve a su carpeta.

POR QUÉ SOBRE UNA CAPTURA Y NO EN VIVO
--------------------------------------
El píxel que eliges en la captura es exactamente el píxel de la pantalla:
la captura se toma a resolución nativa y el proceso es DPI-aware. Pero
además puedes acercarte con la lupa, corregir con las flechas y rehacer un
campo cuantas veces quieras, sin tocar el ERP ni una sola vez.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import sys
import time
import webbrowser
from datetime import datetime
from pathlib import Path

# El DPI awareness debe fijarse ANTES de que pyautogui mida nada.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from bot_core.commons.console import setup_console_encoding  # noqa: E402
from bot_core.commons.pantalla import activar_dpi_awareness, huella_pantalla  # noqa: E402

setup_console_encoding()
activar_dpi_awareness()

import pyautogui  # noqa: E402

RAIZ = Path(__file__).resolve().parent
DIR_MAPEO = RAIZ / "data" / "mapeo"
DIR_COORDENADAS = RAIZ / "data" / "coordenadas"
DIR_ANCLAS = RAIZ / "imagenes" / "anclas"
PLANTILLA = RAIZ / "bot_core" / "commons" / "plantilla_mapeo.html"


# ══════════════════════════════════════════════════════════════════
# Catálogo de pantallas de NetComercial
#
# Los nombres de campo salen de las pantallas reales, no de una
# suposición. Aun así, en la página del mapeador puedes borrar los que no
# uses y agregar los que falten sin tocar este archivo: lo que vale queda
# guardado en el JSON del perfil.
#
# El orden de la lista es el orden en que aparecen las pantallas al
# trabajar, y también el orden en que conviene mapearlas.
# ══════════════════════════════════════════════════════════════════

PANTALLAS: dict[str, dict] = {
    # ── 1. Antes de abrir el programa ─────────────────────────────
    "escritorio_rdp": {
        "nombre": "Escritorio remoto — antes de abrir NetComercial",
        "campos": [
            ("icono_netcomercial", "Ícono de NetComercial en el escritorio remoto"),
            ("cerrar_windows", "Botón que cierra el aviso de Windows, si sale"),
            ("cerrar_pdf_creator", "Botón que cierra PDF Creator, si sale"),
        ],
    },

    # ── 2. «Bienvenidos al Sistema» ───────────────────────────────
    "login": {
        "nombre": "Bienvenidos al Sistema — parámetros de seguridad",
        "campos": [
            ("usuario", "Caja «Usuario»"),
            ("password", "Caja «Contraseña»"),
            ("periodo", "Caja «Periodo» (2026)"),
            ("fecha", "Caja «Fecha»"),
            ("tc_compra", "Caja «T/C Compra»"),
            ("tc_venta", "Caja «T/C Venta»"),
            ("boton_aceptar", "Botón «Aceptar»"),
        ],
    },

    # ── 3. «SELECCION DE EMPRESAS» ────────────────────────────────
    "seleccion_empresa": {
        "nombre": "Selección de empresas",
        "campos": [
            ("primera_fila", "Primera fila de la grilla (001 PLASTICOS NACIONALES S A)"),
            ("caja_buscar", "Caja «Buscar»"),
            ("boton_seleccionar", "Botón «Seleccionar»"),
        ],
    },

    # ── 4. «SELECCION DE ALMACENES» ───────────────────────────────
    "seleccion_almacen": {
        "nombre": "Selección de almacenes",
        "campos": [
            ("fila_104_insumos", "Fila «104 ALMACEN DE INSUMOS Y REPUESTOS»"),
            ("boton_acepta", "Botón «Acepta»"),
        ],
    },

    # ── 5. La barra de menús ──────────────────────────────────────
    "menu_ordenes_compra": {
        "nombre": "Menú — Compras / O.Compra",
        "campos": [
            ("menu_compras", "Menú «Compras / O.Compra» de la barra superior"),
            ("opcion_ingreso_oc", "Opción «Ingreso de Ordenes de Compra»"),
        ],
    },

    # ── 6. La cabecera del formulario ─────────────────────────────
    #
    # Muchos de estos campos probablemente se alcancen con Tab o Enter y
    # no hagan falta. Mapéalos igual: sobra una coordenada que no se usa,
    # falta la que se necesita a mitad de una corrida.
    "oc_cabecera": {
        "nombre": "Orden de Compra — cabecera",
        "campos": [
            ("boton_nuevo_b", "Botón «NueVo/B» de la barra inferior"),
            ("centro_costos_lupa", "Botón «...» de Centro de Costos"),
            ("centro_costos_codigo", "Caja del código de Centro de Costos (94)"),
            ("tipo_anexo", "Desplegable «Tipo Anexo» (PROVEEDORES)"),
            ("proveedor_lupa", "Botón «...» de Ruc/Nombre Prov."),
            ("proveedor_ruc", "Caja del RUC / nombre del proveedor"),
            ("fecha", "Caja «Fecha» de la orden"),
            ("moneda_lupa", "Botón «...» de Moneda"),
            ("moneda_codigo", "Caja del código de Moneda (2 = dólares)"),
            ("tipo_cambio", "Caja «T.cambio»"),
            ("tipo_orden_lupa", "Botón «...» de Tipo de Orden"),
            ("tipo_orden_codigo", "Caja del código de Tipo de Orden"),
            ("fecha_entrega", "Caja «Fecha de Entrega»"),
            ("lugar_entrega", "Caja «Lugar de Entrega»"),
            ("forma_orden_codigo", "Caja del código de FORMA DE ORDEN (S = por servicio)"),
            ("forma_pago_lupa", "Botón «...» de Forma de Pago"),
            ("forma_pago_codigo", "Caja del código de Forma de Pago (1 = contado)"),
            ("forma_pago_dias", "Caja «días»"),
            ("observacion", "Caja «Observación»"),
            ("atencion", "Caja «Atencion»"),
        ],
    },

    # ── 7. La grilla del detalle ──────────────────────────────────
    "oc_detalle": {
        "nombre": "Orden de Compra — detalle de líneas",
        "campos": [
            ("pestana_detalle", "Pestaña «Detalle»"),
            ("boton_nuevo_item", "Botón «Nuevo item»"),
            ("boton_modifica_item", "Botón «Modifica Item»"),
            ("boton_anular_item", "Botón «DEL=Anular Item»"),
            ("celda_cod_producto", "Primera celda de la columna «Cod.Product»"),
            ("celda_descripcion", "Celda de «Descripcion» de la primera línea"),
            ("celda_cantidad", "Celda de «Cantidad» de la primera línea"),
            ("celda_costo_unit", "Celda de «Costo unit.» de la primera línea"),
            ("celda_dscto", "Celda de «% Dscto» de la primera línea"),
            ("total_compra", "Recuadro «Total Compra» del pie"),
            ("sub_total", "Recuadro «Sub-Total» del pie"),
        ],
    },

    # ── 8. Grabar y salir ─────────────────────────────────────────
    "oc_cierre": {
        "nombre": "Orden de Compra — grabar, aprobar y salir",
        "campos": [
            ("numero_oc_serie", "Caja de la serie del No. (002)"),
            ("numero_oc_correlativo", "Caja del correlativo del No. (4476541)"),
            ("estado_oc", "Recuadro «Estado» (ATENDIDA / etc.)"),
            ("boton_modificar", "Botón «MoDificar»"),
            ("boton_aprobar_oc", "Botón «Aprobar OC»"),
            ("boton_consultar", "Botón «Consultar»"),
            ("boton_salir", "Botón «Salir»"),
            ("confirmacion_si", "Botón «Sí» del cuadro de confirmación al grabar"),
        ],
    },
}


# ══════════════════════════════════════════════════════════════════
# Mapeo
# ══════════════════════════════════════════════════════════════════


def _cuenta_regresiva(segundos: int) -> None:
    print()
    print("  Pasa AHORA a la ventana de NetComercial dentro del RDP.")
    print("  Déjala en la pantalla exacta que quieres mapear.")
    print()
    for queda in range(segundos, 0, -1):
        print(f"\r  Capturando en {queda:2d} s...  ", end="", flush=True)
        time.sleep(1)
    print("\r  Capturando ahora.          ")


def mapear(pantalla_id: str, espera: int, sin_abrir: bool) -> int:
    definicion = PANTALLAS.get(pantalla_id)
    if definicion is None:
        definicion = {
            "nombre": pantalla_id.replace("_", " ").capitalize(),
            "campos": [],
        }
        print(f"  '{pantalla_id}' no está en el catálogo: se mapea en blanco.")
        print("  Agrega los campos que necesites desde la propia página.")

    huella = huella_pantalla()
    print()
    print("  " + "=" * 58)
    print(f"  MAPEO · {definicion['nombre']}")
    print("  " + "=" * 58)
    print(f"  Resolución ....... {huella['ancho']} x {huella['alto']} px")
    print(f"  Escala Windows ... {huella['escala_windows']:.0%}")
    print(f"  DPI-aware ........ {'sí' if huella['dpi_aware'] else 'NO'}")

    if abs(huella["escala_windows"] - 1.0) > 0.01:
        print()
        print("  AVISO: la escala de Windows no está al 100%. Funciona igual,")
        print("  pero si algún día la cambias, este mapeo deja de servir y el")
        print("  bot se negará a correr hasta que vuelvas a mapear.")

    _cuenta_regresiva(espera)

    DIR_MAPEO.mkdir(parents=True, exist_ok=True)
    sello = datetime.now().strftime("%Y%m%d_%H%M%S")
    ruta_png = DIR_MAPEO / f"{pantalla_id}_{sello}.png"
    pyautogui.screenshot(str(ruta_png))
    print(f"  Captura ......... {ruta_png.relative_to(RAIZ)}")

    campos = [
        {"nombre": n, "desc": d, "x": None, "y": None, "nota": ""}
        for n, d in definicion["campos"]
    ]

    datos_png = base64.b64encode(ruta_png.read_bytes()).decode("ascii")
    html = PLANTILLA.read_text(encoding="utf-8")
    reemplazos = {
        "__PANTALLA_NOMBRE__": definicion["nombre"],
        "__ANCHO__": str(huella["ancho"]),
        "__ALTO__": str(huella["alto"]),
        "__ESCALA__": f"{huella['escala_windows']:.0%}",
        "__IMAGEN__": f"data:image/png;base64,{datos_png}",
        "__PANTALLA_ID_JSON__": json.dumps(pantalla_id),
        "__PANTALLA_NOMBRE_JSON__": json.dumps(definicion["nombre"]),
        "__HUELLA_JSON__": json.dumps(huella),
        "__CAPTURA_JSON__": json.dumps(ruta_png.name),
        "__CAMPOS_JSON__": json.dumps(campos, ensure_ascii=False),
    }
    for marca, valor in reemplazos.items():
        html = html.replace(marca, valor)

    ruta_html = DIR_MAPEO / f"{pantalla_id}_{sello}.html"
    ruta_html.write_text(html, encoding="utf-8")
    print(f"  Mapeador ........ {ruta_html.relative_to(RAIZ)}")

    if not sin_abrir:
        webbrowser.open(ruta_html.as_uri())

    print()
    print("  En la página que se abrió:")
    print("    1. Marca el ancla: arrastra un recuadro sobre un rótulo fijo.")
    print("    2. Elige cada campo y haz clic sobre la captura (la lupa de")
    print("       abajo a la derecha te da precisión de píxel; las flechas")
    print("       del teclado corrigen el punto ya puesto).")
    print("    3. Pulsa «Guardar perfil» — descarga el JSON y el ancla.")
    print()
    print("  Y luego, aquí:   python mapear.py --instalar")
    print()
    return 0


# ══════════════════════════════════════════════════════════════════
# Instalación de lo descargado
# ══════════════════════════════════════════════════════════════════


def _carpeta_descargas() -> Path:
    perfil = Path(os.environ.get("USERPROFILE") or Path.home())
    for nombre in ("Downloads", "Descargas"):
        candidata = perfil / nombre
        if candidata.is_dir():
            return candidata
    return perfil


def instalar(origen: Path | None) -> int:
    descargas = origen or _carpeta_descargas()
    print()
    print(f"  Buscando perfiles descargados en: {descargas}")

    if not descargas.is_dir():
        print("  Esa carpeta no existe. Indica otra con --desde <ruta>.")
        return 1

    conocidas = set(PANTALLAS) | {p.stem for p in DIR_COORDENADAS.glob("*.json")}
    movidos = 0

    DIR_COORDENADAS.mkdir(parents=True, exist_ok=True)
    DIR_ANCLAS.mkdir(parents=True, exist_ok=True)

    for archivo in sorted(descargas.glob("*.json")):
        try:
            datos = json.loads(archivo.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        pantalla_id = datos.get("pantalla_id")
        if not pantalla_id:
            continue
        if pantalla_id not in conocidas and "campos" not in datos:
            continue

        destino = DIR_COORDENADAS / f"{pantalla_id}.json"
        if destino.exists():
            respaldo = DIR_COORDENADAS / f"{pantalla_id}.anterior.json"
            shutil.copy2(destino, respaldo)
            print(f"  El perfil anterior de '{pantalla_id}' quedó en {respaldo.name}")
        shutil.move(str(archivo), str(destino))
        n = len(datos.get("campos", {}))
        print(f"  [perfil] {pantalla_id}: {n} campos -> {destino.relative_to(RAIZ)}")
        movidos += 1

        ancla = datos.get("ancla") or {}
        nombre_img = ancla.get("imagen")
        if nombre_img:
            png = descargas / nombre_img
            if png.exists():
                shutil.move(str(png), str(DIR_ANCLAS / nombre_img))
                print(f"  [ancla ] {nombre_img} -> {DIR_ANCLAS.relative_to(RAIZ)}")
            else:
                print(f"  [ancla ] AVISO: no se encontró {nombre_img} en descargas.")

    if movidos == 0:
        print("  No había ningún perfil nuevo que instalar.")
        return 1

    print()
    print(f"  {movidos} perfil(es) instalado(s).")
    print("  Verifícalos sin tocar nada:  python verificar_coordenadas.py")
    print()
    return 0


# ══════════════════════════════════════════════════════════════════


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Mapea las coordenadas de una pantalla de NetComercial.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("pantalla", nargs="?", help="Id de la pantalla a mapear")
    parser.add_argument("--listar", action="store_true", help="Ver el catálogo de pantallas")
    parser.add_argument("--instalar", action="store_true",
                        help="Mover a su sitio los perfiles descargados")
    parser.add_argument("--desde", type=Path, default=None,
                        help="Carpeta donde buscar lo descargado (por defecto, Descargas)")
    parser.add_argument("--espera", type=int, default=10,
                        help="Segundos antes de capturar (por defecto 10)")
    parser.add_argument("--sin-abrir", action="store_true",
                        help="No abrir el navegador automáticamente")
    args = parser.parse_args()

    if args.instalar:
        return instalar(args.desde)

    if args.listar or not args.pantalla:
        ya = {p.stem for p in DIR_COORDENADAS.glob("*.json")}
        print()
        print("  PANTALLAS DEL CATÁLOGO")
        print("  " + "-" * 58)
        for clave, definicion in PANTALLAS.items():
            marca = "[mapeada]" if clave in ya else "[ pendiente ]"
            print(f"  {marca}  {clave:<22} {definicion['nombre']}")
        extra = ya - set(PANTALLAS)
        for clave in sorted(extra):
            print(f"  [mapeada]  {clave:<22} (fuera del catálogo)")
        print()
        print("  Mapear:     python mapear.py <id>")
        print("  Instalar:   python mapear.py --instalar")
        print()
        return 0

    return mapear(args.pantalla, args.espera, args.sin_abrir)


if __name__ == "__main__":
    raise SystemExit(main())
