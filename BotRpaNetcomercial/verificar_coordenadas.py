"""
Verifica un perfil de coordenadas SIN HACER NI UN SOLO CLIC.

Este archivo existe por una razón concreta: NetComercial no tiene ambiente
de pruebas. La primera vez que el bot toca la pantalla, la toca en
producción. Antes de eso hay que poder contestar «sí, esos 24 puntos caen
donde deben» sin arriesgar nada.

    python verificar_coordenadas.py                  todos los perfiles, anotados
    python verificar_coordenadas.py oc_cabecera      solo ese
    python verificar_coordenadas.py oc_cabecera --mover   pasea el mouse por los puntos

Dos formas de mirar:

  --anotar (por defecto)  Toma una captura nueva de la pantalla actual y
        dibuja encima cada punto con su nombre. Sale un PNG que puedes
        revisar con calma y mandar por correo. No mueve el mouse.

  --mover  Lleva el mouse a cada punto, uno por uno, anunciando en voz
        alta cuál es. Sirve para comprobar en vivo que el campo se
        resalta al pasar por encima. NUNCA pulsa el botón.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bot_core.commons.console import setup_console_encoding  # noqa: E402
from bot_core.commons.pantalla import (  # noqa: E402
    PantallaDistinta,
    activar_dpi_awareness,
    huella_pantalla,
)

setup_console_encoding()
activar_dpi_awareness()

import pyautogui  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from bot_core.commons import perfiles  # noqa: E402

RAIZ = Path(__file__).resolve().parent
DIR_SALIDA = RAIZ / "data" / "verificacion"

COLOR_PUNTO = (239, 68, 68)
COLOR_ANCLA = (34, 211, 238)
COLOR_TEXTO = (255, 255, 255)
COLOR_FONDO_TEXTO = (15, 23, 42)


def _fuente(tam: int = 13) -> ImageFont.ImageFont:
    for nombre in ("segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(nombre, tam)
        except OSError:
            continue
    return ImageFont.load_default()


def _cruz(dibujo: ImageDraw.ImageDraw, x: int, y: int, color, brazo: int = 11) -> None:
    dibujo.line([(x - brazo, y), (x + brazo, y)], fill=color, width=2)
    dibujo.line([(x, y - brazo), (x, y + brazo)], fill=color, width=2)
    dibujo.ellipse([x - 3, y - 3, x + 3, y + 3], outline=color, width=2)


def _etiqueta(dibujo: ImageDraw.ImageDraw, x: int, y: int, texto: str, fuente, ancho: int) -> None:
    caja = dibujo.textbbox((0, 0), texto, font=fuente)
    w, h = caja[2] - caja[0], caja[3] - caja[1]
    tx, ty = x + 14, y - h - 8
    if tx + w + 10 > ancho:
        tx = x - w - 18
    if ty < 2:
        ty = y + 12
    dibujo.rectangle([tx - 4, ty - 3, tx + w + 5, ty + h + 5], fill=COLOR_FONDO_TEXTO)
    dibujo.text((tx, ty), texto, font=fuente, fill=COLOR_TEXTO)


def anotar(perfil: perfiles.Perfil) -> Path:
    """Captura la pantalla de ahora y dibuja encima los puntos del perfil."""
    captura = pyautogui.screenshot().convert("RGB")
    dibujo = ImageDraw.Draw(captura)
    fuente = _fuente()
    ancho = captura.width

    if perfil.ancla and perfil.ancla.get("recorte"):
        l, t, w, h = perfil.ancla["recorte"][:4]
        dibujo.rectangle([l, t, l + w, t + h], outline=COLOR_ANCLA, width=2)
        _etiqueta(dibujo, l + w, t, f"ancla · {perfil.ancla.get('nombre', '')}", fuente, ancho)

    for nombre in sorted(perfil.campos):
        x, y = perfil.punto(nombre)
        _cruz(dibujo, x, y, COLOR_PUNTO)
        _etiqueta(dibujo, x, y, nombre, fuente, ancho)

    DIR_SALIDA.mkdir(parents=True, exist_ok=True)
    sello = time.strftime("%Y%m%d_%H%M%S")
    destino = DIR_SALIDA / f"verificacion_{perfil.pantalla_id}_{sello}.png"
    captura.save(destino)
    return destino


def pasear(perfil: perfiles.Perfil, pausa: float) -> None:
    """Lleva el mouse a cada punto, sin pulsar nunca el botón."""
    print()
    print("  El mouse se va a mover solo. NO se hace ningún clic.")
    print("  Mueve el mouse a una esquina de la pantalla para abortar.")
    print()
    pyautogui.FAILSAFE = True
    for nombre in sorted(perfil.campos):
        x, y = perfil.punto(nombre)
        nota = perfil.nota(nombre)
        print(f"    {nombre:<26} ({x:5d}, {y:5d}){'  · ' + nota if nota else ''}")
        pyautogui.moveTo(x, y, duration=0.35)
        time.sleep(pausa)
    print()
    print("  Recorrido terminado. Ningún clic ejecutado.")


def revisar(pantalla_id: str, modo_mover: bool, pausa: float, tolerar_escala: bool) -> bool:
    try:
        perfil = perfiles.cargar(pantalla_id, verificar=False)
    except perfiles.PerfilNoEncontrado as e:
        print(f"  {e}")
        return False

    print()
    print("  " + "=" * 58)
    print(f"  {perfil.nombre}   ({len(perfil.campos)} campos)")
    print("  " + "=" * 58)
    print(f"  Mapeado el ....... {perfil.mapeado[:19].replace('T', ' ') or 'sin fecha'}")
    print(f"  Mapeado en ....... {perfil.huella.get('ancho')}x{perfil.huella.get('alto')} px, "
          f"escala {perfil.huella.get('escala_windows', 1):.0%}")
    print(f"  Ancla ............ {perfil.ancla.get('nombre') if perfil.ancla else 'SIN ANCLA'}")

    try:
        perfil.verificar(tolerar_escala=tolerar_escala)
        print("  Geometría ........ coincide con la de ahora")
    except PantallaDistinta as e:
        print()
        print(f"  GEOMETRÍA DISTINTA: {e}")
        print("  Se anota igual, para que veas dónde caerían los puntos.")

    if modo_mover:
        pasear(perfil, pausa)
    else:
        destino = anotar(perfil)
        print(f"  Anotado en ....... {destino.relative_to(RAIZ)}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Comprueba un perfil de coordenadas sin hacer clic en nada."
    )
    parser.add_argument("pantalla", nargs="?", help="Id de la pantalla (por defecto, todas)")
    parser.add_argument("--mover", action="store_true",
                        help="Pasear el mouse por los puntos en vez de anotar una captura")
    parser.add_argument("--pausa", type=float, default=0.9,
                        help="Segundos de espera en cada punto al pasear")
    parser.add_argument("--tolerar-escala", action="store_true",
                        help="No exigir que coincida la escala de Windows")
    args = parser.parse_args()

    actual = huella_pantalla()
    print()
    print(f"  Pantalla de ahora: {actual['ancho']}x{actual['alto']} px, "
          f"escala {actual['escala_windows']:.0%}")

    pantallas = [args.pantalla] if args.pantalla else perfiles.listar()
    if not pantallas:
        print()
        print("  No hay ningún perfil mapeado todavía.")
        print("  Empieza con:  python mapear.py --listar")
        print()
        return 1

    revisadas = sum(
        revisar(p, args.mover, args.pausa, args.tolerar_escala) for p in pantallas
    )
    print()
    return 0 if revisadas else 1


if __name__ == "__main__":
    raise SystemExit(main())
