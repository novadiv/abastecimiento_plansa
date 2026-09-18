"""
El proceso residente que vigila los horarios y lanza el bot.

    python iniciar_runner.py            queda escuchando los horarios
    python iniciar_runner.py --ahora    corre una vez y sale
    python iniciar_runner.py --estado   solo consulta cómo está la cola

QUÉ GARANTIZA
-------------
1. **Un bot a la vez.** Hay dos candados, y los dos hacen falta: uno local,
   que impide que el propio programador solape dos disparos, y el del
   backend, que impide que dos máquinas distintas arranquen a la vez.
2. **Nunca arranca a traición.** Antes de tomar el control muestra el aviso
   a pantalla completa con cuenta regresiva y botón de posponer.
3. **No despierta a nadie para nada.** Si la cola está vacía cuando llega
   la hora, no muestra ningún aviso: se vuelve a dormir en silencio.
4. **Los horarios se releen solos.** Cambiar una hora desde la web no exige
   reiniciar este proceso.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import sys
import threading
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .aviso import avisar_fin, pedir_permiso
from .cliente_api import BackendApagado, ClienteApi, ErrorApi, OtroBotCorriendo
from .commons import config
from .commons.console import setup_console_encoding
from .core.registry import get_strategy_cls_by_code, load_all_tasks

log = logging.getLogger("bot.runner")

# APScheduler usa el 0 para el lunes; en la base los días se guardan del
# 1 (lunes) al 7 (domingo), que es como los lee una persona.
_DIAS_CRON = {"1": "mon", "2": "tue", "3": "wed", "4": "thu",
              "5": "fri", "6": "sat", "7": "sun"}


def preparar_log() -> None:
    setup_console_encoding()
    carpeta = Path(config.CARPETA_LOGS)
    carpeta.mkdir(parents=True, exist_ok=True)
    formato = logging.Formatter(
        "%(asctime)s  %(levelname)-7s %(name)-14s %(message)s", "%Y-%m-%d %H:%M:%S"
    )
    archivo = RotatingFileHandler(
        carpeta / "runner.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8"
    )
    archivo.setFormatter(formato)
    consola = logging.StreamHandler()
    consola.setFormatter(formato)

    raiz = logging.getLogger()
    raiz.setLevel(logging.INFO)
    raiz.handlers = [archivo, consola]
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


class Runner:
    def __init__(self, cliente: ClienteApi, tarea: str):
        self.cliente = cliente
        self.tarea = tarea
        self.planificador = BackgroundScheduler(timezone="America/Lima")
        # El candado local: el del backend protege entre máquinas, este
        # protege contra que el propio programador solape dos disparos.
        self.candado = threading.Lock()
        self._firma_horarios: str = ""

    # ── Horarios ─────────────────────────────────────────────────

    def sincronizar_horarios(self) -> None:
        """Relee los horarios de la API y reconstruye los disparos si cambiaron."""
        try:
            horarios = [h for h in self.cliente.horarios() if h.get("tarea_clave") == self.tarea]
        except ErrorApi as e:
            log.warning("No se pudieron leer los horarios: %s", e)
            return

        firma = json.dumps(
            [(h["id"], h["hora"], h["dias"], h["activo"]) for h in horarios], sort_keys=True
        )
        if firma == self._firma_horarios:
            return
        self._firma_horarios = firma

        for job in self.planificador.get_jobs():
            if job.id.startswith("horario:"):
                job.remove()

        for h in horarios:
            dias = ",".join(
                _DIAS_CRON[d.strip()] for d in str(h["dias"]).split(",")
                if d.strip() in _DIAS_CRON
            )
            if not dias:
                log.warning("Horario '%s' sin días válidos; se ignora.", h["nombre"])
                continue
            hora, minuto = h["hora"].split(":")
            self.planificador.add_job(
                self.disparar, CronTrigger(day_of_week=dias, hour=int(hora), minute=int(minuto)),
                id=f"horario:{h['id']}", kwargs={"horario": h},
                misfire_grace_time=600,  # si la PC estaba dormida, sirve hasta 10 min tarde
                coalesce=True,           # no acumular disparos perdidos
                replace_existing=True,
            )
            log.info("Horario activo: «%s» a las %s los días %s%s",
                     h["nombre"], h["hora"], h["dias"],
                     f" (máx. {h['max_items']} unidades)" if h.get("max_items") else "")

        if not horarios:
            log.info("No hay horarios activos. El bot solo correrá si lo lanzas a mano.")

    # ── Disparo ──────────────────────────────────────────────────

    def disparar(self, horario: dict[str, Any] | None = None) -> None:
        """Lo que ejecuta el programador al llegar la hora."""
        if not self.candado.acquire(blocking=False):
            log.warning(
                "Llegó la hora de «%s» pero el bot ya está trabajando. Se omite este "
                "disparo: las unidades siguen en la cola para la próxima.",
                (horario or {}).get("nombre", "corrida manual"),
            )
            return
        try:
            self.correr(disparo="horario" if horario else "manual", horario=horario)
        except Exception:  # noqa: BLE001 — el programador debe sobrevivir a todo
            log.exception("Fallo no controlado en la corrida")
        finally:
            self.candado.release()

    def correr(self, disparo: str = "manual", horario: dict[str, Any] | None = None,
               sin_aviso: bool = False) -> bool:
        """Una corrida completa: avisar, reclamar, ejecutar, cerrar."""
        horario = horario or {}
        nombre = horario.get("nombre") or "Corrida manual"

        # 1. ¿Hay algo que hacer? Si no, no se molesta a nadie.
        try:
            estado = self.cliente.estado()
        except BackendApagado as e:
            log.error("%s", e)
            return False
        pendientes = int(estado.get("pendientes") or 0)
        if pendientes == 0:
            log.info("«%s»: la cola está vacía. Nada que hacer.", nombre)
            return True

        tope = horario.get("max_items")
        a_procesar = min(pendientes, tope) if tope else pendientes

        # 2. Avisar antes de tomar el control de la máquina.
        if not sin_aviso:
            segundos = int(horario.get("aviso_segundos", config.AVISO_SEGUNDOS))
            decision = pedir_permiso(
                titulo=f"Voy a registrar {a_procesar} "
                       f"{'unidad' if a_procesar == 1 else 'unidades'} en NetComercial",
                detalle=f"Corrida: {nombre}.  Quedan {pendientes} en la cola.  "
                        f"Mientras el bot trabaja, la computadora no se puede usar.",
                segundos=segundos,
                minutos_posponer=config.MINUTOS_POSPONER,
            )
            if decision == "cancelar":
                log.info("«%s» cancelada desde el aviso. La cola queda intacta.", nombre)
                return False
            if decision == "posponer":
                self.posponer(horario, config.MINUTOS_POSPONER)
                return False

        # 3. Tomar el candado del backend y recibir el trabajo.
        try:
            respuesta = self.cliente.reclamar(
                tarea=self.tarea, disparo=disparo,
                horario_id=horario.get("id"), max_items=tope, pid=os.getpid(),
            )
        except OtroBotCorriendo as e:
            log.warning("No se pudo arrancar: %s", e)
            return False
        except ErrorApi as e:
            log.error("No se pudo reclamar trabajo: %s", e)
            return False

        if not respuesta.get("hay_trabajo"):
            log.info("El backend no entregó trabajo. Nada que hacer.")
            return True

        return self._ejecutar(respuesta, nombre)

    def posponer(self, horario: dict[str, Any], minutos: int) -> None:
        """Vuelve a intentarlo dentro de un rato, una sola vez."""
        cuando = datetime.now() + timedelta(minutes=minutos)
        self.planificador.add_job(
            self.disparar, DateTrigger(run_date=cuando),
            id=f"pospuesto:{horario.get('id', 'manual')}",
            kwargs={"horario": horario}, replace_existing=True,
        )
        log.info("Pospuesto %s minutos: nuevo intento a las %s.",
                 minutos, cuando.strftime("%H:%M"))

    # ── La corrida ───────────────────────────────────────────────

    def _ejecutar(self, respuesta: dict[str, Any], nombre_corrida: str) -> bool:
        from .core.bot_conectado import BotConectado  # tardío: arrastra pyautogui

        ejecucion_id = respuesta["ejecucion_id"]
        job_id = respuesta["job_id"]
        unidades = respuesta["unidades"]

        load_all_tasks()
        cls = get_strategy_cls_by_code(respuesta.get("estrategia", ""))
        if cls is None:
            mensaje = (
                f"No existe ninguna estrategia con el código "
                f"'{respuesta.get('estrategia')}'. Revisa que el archivo de la "
                f"estrategia esté en bot_core/scripts/ y lleve su @register."
            )
            log.error(mensaje)
            self.cliente.evento(ejecucion_id, nivel="error", paso="arranque", mensaje=mensaje)
            self.cliente.finalizar(ejecucion_id, "fallida", mensaje)
            return False

        items = [self._preparar(u) for u in unidades]
        log.info("Corrida %s: %s unidad(es) con la estrategia '%s'.",
                 job_id, len(items), cls.__name__)

        bot = BotConectado(job_id, self.cliente, ejecucion_id)
        exito = False
        try:
            exito = bot.ejecutar_lote(cls(), items, delay_segundos=3)
        except KeyboardInterrupt:
            log.warning("Corrida interrumpida a mano.")
            bot.finalizar_con_error("Interrumpida a mano desde la consola del bot.")
        except Exception as e:  # noqa: BLE001
            log.exception("La corrida se rompió")
            bot.anotar_excepcion("corrida", e)
            bot.finalizar_con_error(f"{type(e).__name__}: {e}")
        finally:
            self._cerrar_entorno(bot)

        r = bot.resumen_corrida()
        log.info("Corrida %s terminada: %s ok, %s fallidas, %s saltadas.",
                 job_id, r["exitosos"], r["fallidos"], r["saltados"])
        avisar_fin(
            titulo="El bot terminó" if exito else "El bot terminó con incidencias",
            detalle=f"{nombre_corrida}: {r['exitosos']} registradas, "
                    f"{r['fallidos']} con error, {r['saltados']} saltadas."
                    + (f"\n{r['error']}" if r["error"] else ""),
        )
        return exito

    @staticmethod
    def _preparar(unidad: dict[str, Any]) -> dict[str, Any]:
        """Aplana el payload guardado para que la estrategia lo vea entero.

        En la base, la unidad guarda sus columnas y además el JSON completo
        tal como se encoló. La estrategia no debería tener que saber de esa
        separación: recibe un solo diccionario.
        """
        datos = dict(unidad)
        payload = datos.pop("payload", None)
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                payload = {}
        if isinstance(payload, dict):
            datos = {**payload, **datos}
        return datos

    @staticmethod
    def _cerrar_entorno(bot) -> None:
        """Deja la máquina como estaba: sin la aplicación abierta y sin RDP.

        Cada paso va por separado a propósito: si cerrar la aplicación
        falla, igual hay que intentar cerrar la sesión remota, o quedaría
        abierta toda la noche.
        """
        for paso, accion in (
            ("cerrar la aplicación", bot.cerrar_aplicacion),
            ("limpiar el entorno remoto", bot.limpiar_entorno_rdp),
            ("cerrar la sesión remota", bot.cerrar_conexion_remota),
        ):
            try:
                accion()
            except Exception as e:  # noqa: BLE001
                log.warning("No se pudo %s: %s", paso, e)

    # ── Ciclo de vida ────────────────────────────────────────────

    def escuchar(self) -> None:
        self.sincronizar_horarios()
        self.planificador.add_job(
            self.sincronizar_horarios,
            IntervalTrigger(minutes=config.RECARGA_HORARIOS_MINUTOS),
            id="sincronizar", replace_existing=True,
        )
        self.planificador.start()
        log.info("Runner escuchando. Ctrl+C para salir.")

        parar = threading.Event()
        signal.signal(signal.SIGINT, lambda *_: parar.set())
        try:
            signal.signal(signal.SIGTERM, lambda *_: parar.set())
        except (AttributeError, ValueError):
            pass  # SIGTERM no siempre existe en Windows
        parar.wait()

        log.info("Cerrando el runner...")
        # `wait=True`: si hay una corrida en marcha, se la deja terminar. Matarla
        # a medias dejaría un formulario a medio llenar dentro del ERP.
        self.planificador.shutdown(wait=True)
        log.info("Runner detenido.")


# ══════════════════════════════════════════════════════════════════


def _crear_cliente() -> ClienteApi:
    if not config.BOT_TOKEN:
        print()
        print("  FALTA EL TOKEN DEL BOT.")
        print("  Define BOT_TOKEN en el archivo .env de la raíz del proyecto.")
        print("  Tiene que ser el mismo valor que lee el backend.")
        print()
        raise SystemExit(2)
    return ClienteApi(config.API_BASE_URL, config.BOT_TOKEN, config.API_TIMEOUT)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Programador y lanzador del bot RPA.")
    parser.add_argument("--ahora", action="store_true", help="Correr una vez y salir")
    parser.add_argument("--estado", action="store_true", help="Solo consultar la cola")
    parser.add_argument("--sin-aviso", action="store_true",
                        help="Saltarse el aviso a pantalla completa (solo para pruebas)")
    parser.add_argument("--tarea", default=config.BOT_TAREA, help="Clave de la tarea")
    args = parser.parse_args(argv)

    preparar_log()
    cliente = _crear_cliente()

    if args.estado:
        try:
            e = cliente.estado()
        except ErrorApi as err:
            print(f"\n  {err}\n")
            return 1
        viva = e.get("ejecucion_viva")
        print()
        print(f"  Base del bot ......... {e.get('archivo')}")
        print(f"  Unidades pendientes .. {e.get('pendientes')}")
        print(f"  Con error ............ {e.get('fallidos')}")
        print(f"  Horarios activos ..... {e.get('horarios_activos')}")
        print(f"  Corrida en marcha .... {viva['job_id'] + ' (' + viva['estado'] + ')' if viva else 'ninguna'}")
        print()
        for h in e.get("horarios", []):
            marca = "activo  " if h["activo"] else "apagado "
            print(f"    [{marca}] {h['hora']}  días {h['dias']:<12} {h['nombre']}")
        print()
        return 0

    runner = Runner(cliente, args.tarea)

    if args.ahora:
        return 0 if runner.correr(disparo="manual", sin_aviso=args.sin_aviso) else 1

    runner.escuchar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
