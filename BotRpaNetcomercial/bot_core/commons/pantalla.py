"""
Geometría de la pantalla: conciencia de DPI y huella de resolución.

POR QUÉ EXISTE ESTE ARCHIVO
---------------------------
En Windows, un proceso Python que NO declara ser "DPI-aware" recibe de la
API coordenadas *lógicas* (ya escaladas), mientras que la captura de
pantalla llega en píxeles *físicos*. Con la escala de Windows al 125% eso
significa que mapeas un campo sobre la captura en (1200, 400) y el bot
termina haciendo clic en (960, 320) — en otro sitio.

Y ese es el peor fallo posible: el bot no se cae, hace clic mal. Dentro de
un ERP de producción, hacer clic mal es peor que no hacer nada.

Llamando `activar_dpi_awareness()` al inicio de CUALQUIER proceso que mire
o toque la pantalla (el bot, el mapeador, el verificador), todo queda en
píxeles físicos y las dos cosas coinciden siempre.

La segunda mitad del archivo es la "huella": un retrato de la pantalla en
el momento del mapeo. El bot la compara al arrancar y se NIEGA a correr si
no coincide, en vez de hacer clics a ciegas sobre una geometría que cambió.
"""

from __future__ import annotations

import ctypes
import logging
import sys
from typing import Any

log = logging.getLogger("bot.pantalla")

_ya_activado = False


def activar_dpi_awareness() -> bool:
    """Declara el proceso como DPI-aware por monitor. Idempotente.

    Debe llamarse ANTES de importar/usar pyautogui para que sus medidas y
    sus clics vivan en el mismo sistema de coordenadas que las capturas.

    Returns:
        True si el proceso quedó DPI-aware (o ya lo estaba).
    """
    global _ya_activado
    if _ya_activado:
        return True
    if not sys.platform.startswith("win"):
        _ya_activado = True
        return True

    try:
        # PROCESS_PER_MONITOR_DPI_AWARE = 2 (Windows 8.1+)
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        _ya_activado = True
        return True
    except AttributeError:
        pass
    except OSError:
        # E_ACCESSDENIED: ya estaba puesto por el manifiesto o por otra llamada.
        _ya_activado = True
        return True

    try:
        ctypes.windll.user32.SetProcessDPIAware()
        _ya_activado = True
        return True
    except Exception as e:  # noqa: BLE001 - diagnóstico, no queremos que tumbe el arranque
        log.warning("No se pudo activar DPI awareness: %s", e)
        return False


def escala_windows() -> float:
    """Factor de escala de la pantalla principal (1.0 = 100%, 1.25 = 125%)."""
    if not sys.platform.startswith("win"):
        return 1.0
    try:
        dc = ctypes.windll.user32.GetDC(0)
        try:
            LOGPIXELSX = 88
            ppp = ctypes.windll.gdi32.GetDeviceCaps(dc, LOGPIXELSX)
        finally:
            ctypes.windll.user32.ReleaseDC(0, dc)
        return round(ppp / 96.0, 4)
    except Exception:  # noqa: BLE001
        return 1.0


def huella_pantalla() -> dict[str, Any]:
    """Retrato de la geometría actual, para guardar junto a las coordenadas."""
    activar_dpi_awareness()
    import pyautogui  # import tardío: después de fijar el DPI awareness

    ancho, alto = pyautogui.size()
    return {
        "ancho": int(ancho),
        "alto": int(alto),
        "escala_windows": escala_windows(),
        "dpi_aware": _ya_activado,
    }


class PantallaDistinta(RuntimeError):
    """La pantalla de ahora no es la pantalla en la que se mapearon las coordenadas."""


def verificar_huella(esperada: dict[str, Any], *, tolerar_escala: bool = False) -> None:
    """Compara la pantalla actual contra la del mapeo. Lanza si no coinciden.

    Esta es la barrera que impide que el bot haga clic a ciegas cuando
    alguien cambió la resolución del RDP o la escala de Windows.

    Args:
        esperada: el bloque `pantalla` del perfil de coordenadas.
        tolerar_escala: si True, solo exige que coincida la resolución.

    Raises:
        PantallaDistinta: con un mensaje que dice exactamente qué cambió.
    """
    actual = huella_pantalla()
    diferencias: list[str] = []

    if (actual["ancho"], actual["alto"]) != (esperada.get("ancho"), esperada.get("alto")):
        diferencias.append(
            f"resolución: se mapeó en {esperada.get('ancho')}x{esperada.get('alto')} "
            f"y ahora la pantalla es {actual['ancho']}x{actual['alto']}"
        )

    if not tolerar_escala:
        esc_esperada = esperada.get("escala_windows")
        if esc_esperada is not None and abs(actual["escala_windows"] - esc_esperada) > 0.01:
            diferencias.append(
                f"escala de Windows: se mapeó al {esc_esperada:.0%} "
                f"y ahora está al {actual['escala_windows']:.0%}"
            )

    if diferencias:
        raise PantallaDistinta(
            "Las coordenadas no sirven para esta pantalla — "
            + "; ".join(diferencias)
            + ". El bot se detuvo ANTES de hacer clic. "
            "Restaura la geometría original, o vuelve a mapear con "
            "`python mapear.py`."
        )
