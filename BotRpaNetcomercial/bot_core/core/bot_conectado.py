"""
El bot, reportando a la API en vez de solo a un archivo JSON.

`RegistroBot` (en `bot.py`) ya resuelve la orquestación completa: conectar,
hacer login, recorrer las unidades con reintentos, el cortacircuito ante
fallos seguidos, y el control externo de pausar/saltar/detener. Eso no hay
que volver a escribirlo.

Lo único que cambia cuando el bot trabaja contra la aplicación web es **a
quién le cuenta lo que va pasando**. Así que esta clase no reimplementa
nada: hereda y sustituye las cinco costuras de reporte —progreso, resultado
de cada unidad, capturas, control externo y cierre— para que además de
escribir el JSON local, hablen con la API.

El JSON local se mantiene a propósito: si el backend se cae a mitad de una
corrida, en `jobs/` queda el rastro completo de lo que el bot hizo.
"""

from __future__ import annotations

import logging
import os
import time
import traceback
from typing import Any

from .bot import RegistroBot
from .base_bot import _print
from ..cliente_api import ClienteApi

log = logging.getLogger("bot.conectado")


class BotConectado(RegistroBot):
    """Un `RegistroBot` que además reporta cada paso a la aplicación web."""

    def __init__(self, job_id: str, cliente: ClienteApi, ejecucion_id: int):
        super().__init__(job_id=job_id)
        self.cliente = cliente
        self.ejecucion_id = ejecucion_id
        self._ultima_captura: str = ""

    # ── Progreso ─────────────────────────────────────────────────

    def actualizar_progreso(self, paso: str, progreso: int | None = None) -> None:
        super().actualizar_progreso(paso, progreso)
        self.cliente.progreso(self.ejecucion_id, paso, self.estado["progreso"])

    # ── Resultado de cada unidad ─────────────────────────────────

    def _registrar_detalle(
        self, item_id: str, item_data: dict, estado: str, error: str | None = None
    ) -> None:
        super()._registrar_detalle(item_id, item_data, estado, error)

        # 'en_proceso' ya lo sabe el backend desde que entregó el trabajo;
        # aquí solo interesan los desenlaces.
        if estado not in ("completado", "fallido", "saltado"):
            return

        try:
            id_bd = int(item_id)
        except (TypeError, ValueError):
            log.warning("No se pudo reportar la unidad '%s': id no numérico.", item_id)
            return

        self.cliente.resultado(
            id_bd,
            estado,
            resultado=str(item_data.get("resultado", "") or ""),
            error=error or "",
        )
        self.cliente.evento(
            self.ejecucion_id,
            nivel="error" if estado == "fallido" else "info",
            paso=f"unidad:{estado}",
            mensaje=f"{item_data.get('etiqueta') or item_id}: {estado}"
                    + (f" — {error}" if error else ""),
            item_id=id_bd,
            captura=self._ultima_captura if estado == "fallido" else "",
        )
        self._ultima_captura = ""

    # ── Capturas de pantalla ─────────────────────────────────────

    def agregar_screenshot(self, ruta: str) -> None:
        """Guarda el nombre para adjuntarlo al evento de la unidad que falló.

        Se manda solo el nombre del archivo, no la ruta: el backend sirve
        las capturas desde una carpeta conocida y no acepta rutas.
        """
        super().agregar_screenshot(ruta)
        if ruta:
            self._ultima_captura = os.path.basename(ruta)

    def anotar(self, paso: str, mensaje: str = "", nivel: str = "info",
               con_captura: bool = False) -> None:
        """Deja una línea en la bitácora desde donde haga falta.

        Es el método que usa una Strategy para narrar lo que va haciendo
        («abriendo el módulo», «línea 3 de 12»). Cuanto más fina sea la
        narración, menos hay que adivinar el día que algo falle.
        """
        captura = ""
        if con_captura:
            captura = os.path.basename(self.tomar_screenshot(f"{paso}_{self.job_id}") or "")
        _print(f"  · {paso}: {mensaje}")
        self.cliente.evento(
            self.ejecucion_id, nivel=nivel, paso=paso, mensaje=mensaje, captura=captura
        )

    def anotar_excepcion(self, paso: str, error: Exception) -> None:
        """Una excepción, con su traza y una captura del momento exacto."""
        captura = os.path.basename(self.tomar_screenshot(f"error_{paso}") or "")
        self._ultima_captura = captura
        self.cliente.evento(
            self.ejecucion_id, nivel="error", paso=paso,
            mensaje=f"{type(error).__name__}: {error}",
            captura=captura, detalle=traceback.format_exc(),
        )

    # ── Control externo ──────────────────────────────────────────

    def _verificar_control(self, item_id: str | None = None) -> str:
        """Igual que el original, pero las órdenes llegan por la API.

        Returns:
            'continuar' | 'saltar' | 'detener'
        """
        cmd = self.cliente.control(self.ejecucion_id)
        if not cmd:
            return "continuar"

        accion = cmd.get("accion", "")

        if accion == "detener":
            _print("\n  ORDEN: detener la corrida")
            return "detener"

        if accion == "pausar":
            _print("\n  ORDEN: pausar. Esperando que la reanuden desde la web...")
            self.estado["estado"] = "pausado"
            self.estado["paso_actual"] = "Pausado (esperando reanudación)"
            self._guardar_estado()
            self.cliente.progreso(self.ejecucion_id, "Pausado (esperando reanudación)")
            self.cliente.evento(self.ejecucion_id, nivel="aviso", paso="pausa",
                                mensaje="Corrida pausada desde la aplicación web.")
            return self._esperar_reanudacion()

        if accion == "saltar" and str(cmd.get("item_id") or "") == str(item_id):
            _print(f"  ORDEN: saltar la unidad {item_id}")
            return "saltar"

        return "continuar"

    def _esperar_reanudacion(self, intervalo: float = 3.0, limite_minutos: int = 120) -> str:
        """Espera a que la reanuden, sin dejar morir el latido.

        Si nadie reanuda en dos horas, se detiene: una pausa olvidada
        mantendría el candado tomado y con la sesión RDP abierta toda la
        noche.
        """
        limite = time.time() + limite_minutos * 60
        while time.time() < limite:
            time.sleep(intervalo)
            # Cada consulta de control renueva el latido en el backend.
            cmd = self.cliente.control(self.ejecucion_id)
            if not cmd:
                continue
            if cmd.get("accion") == "reanudar":
                _print("  ORDEN: reanudar")
                self.estado["estado"] = "en_progreso"
                self._guardar_estado()
                self.cliente.evento(self.ejecucion_id, paso="reanudar",
                                    mensaje="Corrida reanudada.")
                return "continuar"
            if cmd.get("accion") == "detener":
                return "detener"

        self.cliente.evento(
            self.ejecucion_id, nivel="error", paso="pausa",
            mensaje=f"Pausada más de {limite_minutos} minutos sin reanudar. Se detiene.",
        )
        return "detener"

    # ── Cierre ───────────────────────────────────────────────────

    def finalizar_con_exito(self) -> None:
        super().finalizar_con_exito()
        self.cliente.finalizar(self.ejecucion_id, "completada")

    def finalizar_con_error(self, error: str) -> None:
        super().finalizar_con_error(error)
        self.cliente.evento(self.ejecucion_id, nivel="error", paso="corrida", mensaje=error)
        self.cliente.finalizar(self.ejecucion_id, "fallida", error)

    # ── Resumen para el cartel de fin ────────────────────────────

    def resumen_corrida(self) -> dict[str, Any]:
        e = self.estado
        return {
            "total": e["total_registros"],
            "exitosos": e["registros_exitosos"],
            "fallidos": e["registros_fallidos"],
            "saltados": e["registros_saltados"],
            "error": e.get("error") or "",
        }
