"""
Perfiles de coordenadas: una pantalla mapeada de NetComercial.

Un perfil es un JSON en `data/coordenadas/<pantalla_id>.json` que guarda
tres cosas, y las tres importan:

  1. La huella de la pantalla en que se mapeó (resolución y escala). Si la
     de hoy no coincide, el bot se niega a correr — ver `pantalla.py`.
  2. Un ANCLA: un recorte de algo fijo y visible de esa pantalla (el rótulo
     de un campo, el título de la ventana) con su posición al momento del
     mapeo.
  3. Los CAMPOS, cada uno con su posición absoluta y, además, su
     desplazamiento (dx, dy) respecto al ancla.

El ancla es lo que hace que esto no se rompa solo. Al pedir un punto, el
perfil busca el ancla en la pantalla actual: si la encuentra desplazada
40 px porque la ventana del ERP no quedó exactamente donde estaba, corrige
todos los campos por igual. Si no la encuentra, cae a la coordenada
absoluta — que sigue siendo válida porque la huella ya se verificó.

Formato del JSON: lo genera `mapear.py`, no se escribe a mano.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Iterator

from .pantalla import activar_dpi_awareness, verificar_huella

log = logging.getLogger("bot.perfiles")

_RAIZ = Path(__file__).resolve().parent.parent.parent
DIR_COORDENADAS = _RAIZ / "data" / "coordenadas"
DIR_ANCLAS = _RAIZ / "imagenes" / "anclas"


class PerfilNoEncontrado(FileNotFoundError):
    """No existe el JSON de esa pantalla — todavía no se ha mapeado."""


class CampoNoMapeado(KeyError):
    """Se pidió un campo que no está en el perfil."""


class Perfil:
    """Las coordenadas de UNA pantalla, resueltas contra la pantalla real."""

    def __init__(self, datos: dict[str, Any], ruta: Path):
        self.ruta = ruta
        self.pantalla_id: str = datos["pantalla_id"]
        self.nombre: str = datos.get("nombre", self.pantalla_id)
        self.mapeado: str = datos.get("mapeado", "")
        self.huella: dict[str, Any] = datos.get("pantalla", {})
        self.ancla: dict[str, Any] | None = datos.get("ancla") or None
        self.campos: dict[str, dict[str, Any]] = datos.get("campos", {})
        self._correccion: tuple[int, int] | None = None
        self._ancla_buscada = False

    # ── Lectura ──────────────────────────────────────────────────────

    def __contains__(self, nombre: str) -> bool:
        return nombre in self.campos

    def __iter__(self) -> Iterator[str]:
        return iter(self.campos)

    def __len__(self) -> int:
        return len(self.campos)

    def nota(self, nombre: str) -> str:
        """La nota que dejó quien mapeó el campo (ej. 'doble clic para reemplazar')."""
        return self.campos.get(nombre, {}).get("nota", "")

    # ── Verificación ─────────────────────────────────────────────────

    def verificar(self, *, tolerar_escala: bool = False) -> None:
        """Comprueba que la pantalla de ahora es la del mapeo. Lanza si no."""
        if not self.huella:
            log.warning(
                "El perfil '%s' no trae huella de pantalla; no se puede verificar "
                "la geometría. Vuelve a mapearlo cuando puedas.",
                self.pantalla_id,
            )
            return
        verificar_huella(self.huella, tolerar_escala=tolerar_escala)

    # ── Resolución de puntos ─────────────────────────────────────────

    def _buscar_correccion(self) -> tuple[int, int]:
        """Localiza el ancla en pantalla y devuelve cuánto se movió todo.

        Se busca UNA sola vez por perfil cargado. Si el ancla no aparece
        (pantalla distinta, ventana tapada), la corrección es (0, 0) y se
        usan las coordenadas absolutas tal cual.
        """
        if self._ancla_buscada:
            return self._correccion or (0, 0)
        self._ancla_buscada = True
        self._correccion = (0, 0)

        if not self.ancla or not self.ancla.get("imagen"):
            return self._correccion

        ruta_img = DIR_ANCLAS / self.ancla["imagen"]
        if not ruta_img.exists():
            log.warning("Ancla de '%s' no encontrada en disco: %s", self.pantalla_id, ruta_img)
            return self._correccion

        try:
            activar_dpi_awareness()
            import pyautogui
            from PIL import Image

            imagen = Image.open(ruta_img)
            if imagen.mode == "RGBA":
                imagen = imagen.convert("RGB")
            caja = pyautogui.locateOnScreen(imagen, confidence=0.9)
            if caja is None:
                log.info(
                    "Ancla '%s' no visible; se usan coordenadas absolutas.",
                    self.ancla.get("nombre", "?"),
                )
                return self._correccion

            # El recorte se guardó como [izq, arriba, ancho, alto] en la
            # captura original: su esquina superior izquierda es la
            # referencia contra la que comparar.
            recorte = self.ancla.get("recorte") or []
            if len(recorte) < 2:
                return self._correccion

            dx = int(caja.left) - int(recorte[0])
            dy = int(caja.top) - int(recorte[1])
            if dx or dy:
                log.info(
                    "Ancla '%s' desplazada (%+d, %+d): se corrigen todos los campos.",
                    self.ancla.get("nombre", "?"), dx, dy,
                )
            self._correccion = (dx, dy)
        except Exception as e:  # noqa: BLE001
            log.warning("No se pudo localizar el ancla de '%s': %s", self.pantalla_id, e)

        return self._correccion or (0, 0)

    def punto(self, nombre: str) -> tuple[int, int]:
        """Coordenada absoluta y corregida de un campo, lista para pyautogui.

        Raises:
            CampoNoMapeado: si el campo no está en el perfil. Es a propósito:
                un clic en (0, 0) por un typo en el nombre sería un clic real
                en una esquina real de producción.
        """
        campo = self.campos.get(nombre)
        if campo is None:
            disponibles = ", ".join(sorted(self.campos)) or "(ninguno)"
            raise CampoNoMapeado(
                f"El campo '{nombre}' no está mapeado en la pantalla "
                f"'{self.pantalla_id}'. Mapeados: {disponibles}"
            )
        dx, dy = self._buscar_correccion()
        return int(campo["x"]) + dx, int(campo["y"]) + dy

    def como_diccionario(self) -> dict[str, tuple[int, int]]:
        """Todos los campos resueltos, para `bot.coordenadas.update(...)`."""
        dx, dy = self._buscar_correccion()
        return {n: (int(c["x"]) + dx, int(c["y"]) + dy) for n, c in self.campos.items()}


def cargar(pantalla_id: str, *, verificar: bool = True) -> Perfil:
    """Carga el perfil de una pantalla desde `data/coordenadas/`."""
    ruta = DIR_COORDENADAS / f"{pantalla_id}.json"
    if not ruta.exists():
        raise PerfilNoEncontrado(
            f"No existe el perfil de coordenadas '{pantalla_id}'. "
            f"Se esperaba en {ruta}. Mapéalo con: python mapear.py {pantalla_id}"
        )
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    perfil = Perfil(datos, ruta)
    if verificar:
        perfil.verificar()
    return perfil


def listar() -> list[str]:
    """Los ids de pantalla ya mapeados."""
    if not DIR_COORDENADAS.exists():
        return []
    return sorted(p.stem for p in DIR_COORDENADAS.glob("*.json"))
