"""
Cliente HTTP del worker contra la API del backend.

El bot NUNCA abre la base de datos por su cuenta: todo pasa por aquí. Así
hay un único dueño de los datos, y el día que el bot se mude a otra máquina
no hay que cambiar nada del esquema.

Regla de diseño de este módulo: **reportar nunca debe tumbar al bot.**
Si el backend está caído mientras el bot tiene una sesión RDP abierta y un
formulario a medio llenar, lo peor que puede pasar es que se pierda una
línea de bitácora — no que el proceso muera dejando el ERP en un estado
raro. Por eso los métodos de reporte tragan los errores de red y solo dejan
constancia en el log local. Las dos excepciones son `reclamar()` y
`finalizar()`: sin la primera no hay trabajo que hacer, y la segunda es la
que libera el candado.
"""

from __future__ import annotations

import logging
from typing import Any

import requests

log = logging.getLogger("bot.api")


class ErrorApi(RuntimeError):
    """El backend contestó algo que impide seguir."""


class BackendApagado(ErrorApi):
    """No se pudo ni contactar al backend."""


class OtroBotCorriendo(ErrorApi):
    """Ya hay una corrida viva: este bot tiene que esperar su turno."""


class ClienteApi:
    def __init__(self, base_url: str, token: str, timeout: int = 20):
        self.base = base_url.rstrip("/")
        self.timeout = timeout
        self.sesion = requests.Session()
        self.sesion.headers.update({
            "X-Bot-Token": token,
            "Content-Type": "application/json",
        })

    # ── Transporte ───────────────────────────────────────────────

    def _pedir(self, metodo: str, ruta: str, cuerpo: dict | None = None) -> dict[str, Any]:
        url = f"{self.base}{ruta}"
        try:
            r = self.sesion.request(metodo, url, json=cuerpo, timeout=self.timeout)
        except requests.exceptions.ConnectionError as e:
            raise BackendApagado(
                f"No se pudo contactar al backend en {self.base}. "
                "¿Está corriendo INICIAR_BACKEND.bat?"
            ) from e
        except requests.exceptions.Timeout as e:
            raise BackendApagado(f"El backend no respondió en {self.timeout} s.") from e

        if r.status_code == 409:
            raise OtroBotCorriendo(self._detalle(r))
        if r.status_code in (401, 403):
            raise ErrorApi(
                "El backend rechazó el token del bot. Revisa que BOT_TOKEN del "
                "`.env` de la raíz y el del bot sean el mismo."
            )
        if r.status_code == 503:
            raise ErrorApi(self._detalle(r))
        if not r.ok:
            raise ErrorApi(f"HTTP {r.status_code}: {self._detalle(r)}")
        return r.json()

    @staticmethod
    def _detalle(r: requests.Response) -> str:
        try:
            cuerpo = r.json()
            return str(cuerpo.get("detail", cuerpo))
        except ValueError:
            return r.text[:300]

    def _reportar(self, metodo: str, ruta: str, cuerpo: dict | None = None) -> dict[str, Any] | None:
        """Como `_pedir`, pero un fallo de red no interrumpe la corrida."""
        try:
            return self._pedir(metodo, ruta, cuerpo)
        except ErrorApi as e:
            log.warning("No se pudo reportar a %s: %s", ruta, e)
            return None

    # ── Ciclo de una corrida ─────────────────────────────────────

    def reclamar(
        self,
        tarea: str = "oc_netcomercial",
        disparo: str = "manual",
        horario_id: int | None = None,
        max_items: int | None = None,
        pid: int | None = None,
    ) -> dict[str, Any]:
        """Toma el candado y recibe el trabajo pendiente.

        Raises:
            OtroBotCorriendo: si ya hay una corrida viva.
            BackendApagado: si no se pudo contactar al backend.
        """
        return self._pedir("POST", "/api/bot/runner/reclamar", {
            "tarea": tarea, "disparo": disparo, "horario_id": horario_id,
            "max_items": max_items, "pid": pid,
        })

    def progreso(self, ejecucion_id: int, paso: str, porcentaje: int | None = None) -> None:
        """Mueve la barra y, de paso, renueva el latido que sostiene el candado."""
        self._reportar("POST", f"/api/bot/runner/ejecucion/{ejecucion_id}/progreso", {
            "paso_actual": paso[:300], "progreso": porcentaje,
        })

    def evento(
        self,
        ejecucion_id: int,
        *,
        nivel: str = "info",
        paso: str = "",
        mensaje: str = "",
        item_id: int | None = None,
        captura: str = "",
        detalle: str = "",
    ) -> None:
        self._reportar("POST", f"/api/bot/runner/ejecucion/{ejecucion_id}/evento", {
            "nivel": nivel, "paso": paso[:120], "mensaje": mensaje[:2000],
            "item_id": item_id, "captura": captura, "detalle": detalle[:6000],
        })

    def resultado(
        self, item_id: int, estado: str, resultado: str = "", error: str = ""
    ) -> None:
        self._reportar("POST", f"/api/bot/runner/item/{item_id}/resultado", {
            "estado": estado, "resultado": resultado[:200], "error": error[:1000],
        })

    def control(self, ejecucion_id: int) -> dict[str, Any] | None:
        """La orden pendiente más antigua (pausar, saltar, detener), si la hay."""
        respuesta = self._reportar("GET", f"/api/bot/runner/ejecucion/{ejecucion_id}/control")
        return (respuesta or {}).get("control")

    def finalizar(self, ejecucion_id: int, estado: str = "completada", error: str = "") -> None:
        """Cierra la corrida y libera el candado.

        Se reintenta una vez: si esto no llega, el candado queda tomado
        hasta que la vigilancia de latido lo suelte, y mientras tanto
        ninguna corrida futura puede arrancar.
        """
        ruta = f"/api/bot/runner/ejecucion/{ejecucion_id}/finalizar"
        cuerpo = {"estado": estado, "error": error[:1000]}
        try:
            self._pedir("POST", ruta, cuerpo)
        except ErrorApi as e:
            log.error("Fallo al cerrar la corrida %s (%s). Reintentando...", ejecucion_id, e)
            try:
                self._pedir("POST", ruta, cuerpo)
            except ErrorApi:
                log.error(
                    "No se pudo cerrar la corrida %s. El candado se liberará solo "
                    "cuando la vigilancia de latido la dé por muerta.", ejecucion_id,
                )

    # ── Configuración ────────────────────────────────────────────

    def horarios(self) -> list[dict[str, Any]]:
        respuesta = self._pedir("GET", "/api/bot/horarios?solo_activos=true")
        return respuesta.get("horarios", [])

    def estado(self) -> dict[str, Any]:
        return self._pedir("GET", "/api/bot/estado")
