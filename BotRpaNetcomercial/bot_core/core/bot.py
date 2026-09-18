"""
Bot principal: orquesta el flujo completo (conectar -> login -> navegar ->
registrar cada item -> cerrar), con tracking de progreso en JSON y un
mecanismo simple de control externo (pausar/saltar/detener).

Este archivo es un ESQUELETO — la parte que de verdad depende de tu proceso
es `ejecutar_lote()`. Ahí es donde defines qué es un "item" (un registro de
tu Excel, una fila de tu base de datos, lo que sea) y qué hace tu Strategy
con cada uno.

Si tu bot recibe trabajo desde una API propia (como hace el bot original de
referencia con `fetch_payload`/`marcar_cargados`), agrega esos métodos aquí
siguiendo el mismo patrón: un `fetch_items()` que trae la lista de trabajo, y
un `reportar_resultado()` que avisa a tu sistema qué se completó.
"""

import json
import os
import time
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List

from .base_bot import BaseBot, _print
from .registry import load_all_tasks, get_registry, get_strategy_cls_by_code
from ..commons.config import CARPETA_JOBS, MAX_REINTENTOS_REGISTRO
from ..commons.timing import countdown


class RegistroBot(BaseBot):
    """Bot que registra datos en una aplicación de escritorio via automatizacion de UI."""

    JOBS_DIR_OVERRIDE = None

    def __init__(self, job_id: str = None):
        super().__init__()
        load_all_tasks()
        self.estrategias_disponibles = get_registry()
        self.job_id = job_id or datetime.now().strftime("%Y%m%d_%H%M%S")
        self.jobs_dir = Path(self.JOBS_DIR_OVERRIDE or CARPETA_JOBS)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self.job_file = self.jobs_dir / f"job_{self.job_id}.json"
        self.control_file = self.jobs_dir / f"job_{self.job_id}_control.json"
        self._inicializar_estado()

    # ================================================================
    # JSON State Tracking (útil para monitorear el bot desde afuera,
    # ej. una pantalla web que lee estos archivos jobs/job_<id>.json)
    # ================================================================

    def _inicializar_estado(self):
        self.estado = {
            "job_id": self.job_id,
            "estado": "inicializado",
            "tarea": None,
            "total_registros": 0,
            "registros_exitosos": 0,
            "registros_fallidos": 0,
            "registros_saltados": 0,
            "registro_actual": 0,
            "progreso": 0,
            "paso_actual": "Inicializado",
            "items_cargados": [],
            "items_fallidos": [],
            "items_saltados": [],
            "detalle_registros": [],  # Detalle por cada item procesado
            "inicio": datetime.now(timezone.utc).isoformat(),
            "fin": None,
            "exito": None,
            "error": None,
            "screenshots": [],
        }
        self._guardar_estado()

    def _guardar_estado(self):
        """Guardado atomico: escribe a temp y renombra."""
        try:
            fd, tmp_path = tempfile.mkstemp(
                dir=str(self.jobs_dir), suffix=".tmp", prefix="job_"
            )
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(self.estado, f, indent=2, ensure_ascii=False, default=str)
            os.replace(tmp_path, str(self.job_file))
        except Exception:
            try:
                with open(self.job_file, "w", encoding="utf-8") as f:
                    json.dump(self.estado, f, indent=2, ensure_ascii=False, default=str)
            except Exception as e:
                _print(f"  Error guardando estado: {e}")

    def actualizar_progreso(self, paso: str, progreso: int = None):
        self.estado["paso_actual"] = paso
        if progreso is not None:
            self.estado["progreso"] = min(progreso, 100)
        self.estado["estado"] = "en_progreso"
        self._guardar_estado()
        _print(f"  [{self.estado['progreso']}%] {paso}")

    def _registrar_detalle(self, item_id: str, item_data: dict, estado: str,
                           error: str = None):
        """Registra el detalle de UN item procesado (para el JSON de estado)."""
        detalle = {
            "item_id": item_id,
            "estado": estado,  # pendiente | en_proceso | completado | fallido | saltado
            "error": error or "",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        for i, d in enumerate(self.estado["detalle_registros"]):
            if d["item_id"] == item_id:
                self.estado["detalle_registros"][i] = detalle
                return
        self.estado["detalle_registros"].append(detalle)

    def finalizar_con_exito(self):
        self.estado["estado"] = "completado"
        self.estado["exito"] = True
        self.estado["progreso"] = 100
        self.estado["fin"] = datetime.now(timezone.utc).isoformat()
        self.estado["paso_actual"] = "Completado"
        self._guardar_estado()

    def finalizar_con_error(self, error: str):
        self.estado["estado"] = "fallido"
        self.estado["exito"] = False
        self.estado["error"] = error
        self.estado["fin"] = datetime.now(timezone.utc).isoformat()
        self.estado["paso_actual"] = f"Error: {error}"
        self._guardar_estado()

    def agregar_screenshot(self, ruta: str):
        if ruta:
            self.estado["screenshots"].append(ruta)
            self._guardar_estado()

    # ================================================================
    # Control Commands (pausar, saltar, detener) — un proceso externo
    # (ej. tu web) escribe jobs/job_<id>_control.json con {"accion": "..."}
    # ================================================================

    def _leer_comando(self) -> Optional[dict]:
        """Lee y consume un comando del archivo de control."""
        if not self.control_file.exists():
            return None
        try:
            data = json.loads(self.control_file.read_text(encoding="utf-8"))
            self.control_file.unlink(missing_ok=True)
            return data
        except Exception:
            return None

    def _verificar_control(self, item_id: str = None) -> str:
        """Verifica comandos de control antes de procesar un item.

        Retorna: 'continuar' | 'saltar' | 'detener'
        """
        cmd = self._leer_comando()
        if not cmd:
            return "continuar"

        accion = cmd.get("accion", "")
        target = cmd.get("item_id", "")

        if accion == "detener":
            _print(f"\n  COMANDO: Detener ejecucion")
            return "detener"

        if accion == "pausar":
            _print(f"\n  COMANDO: Pausar. Esperando reanudacion...")
            self.estado["paso_actual"] = "Pausado (esperando reanudacion)"
            self.estado["estado"] = "pausado"
            self._guardar_estado()
            while True:
                time.sleep(2)
                cmd2 = self._leer_comando()
                if cmd2:
                    if cmd2.get("accion") == "reanudar":
                        _print(f"  COMANDO: Reanudado")
                        self.estado["estado"] = "en_progreso"
                        self._guardar_estado()
                        return "continuar"
                    elif cmd2.get("accion") == "detener":
                        return "detener"

        if accion == "saltar" and target == item_id:
            _print(f"  COMANDO: Saltar item {item_id}")
            return "saltar"

        return "continuar"

    # ================================================================
    # Flujo de negocio — ADAPTA ESTO a tu proceso.
    # ================================================================

    def ejecutar_lote(self, strategy, items: List[dict], delay_segundos: int = 8) -> bool:
        """Ejemplo de orquestación completa: conecta, hace login, navega al
        módulo, y registra cada item de la lista uno por uno.

        `items` es tu propia lista de trabajo — cada dict es lo que tu
        Strategy necesita para llenar un formulario (ver strategy_base.py).
        De dónde sale esa lista es cosa tuya: un archivo Excel, un JSON, una
        API propia, lo que uses.
        """
        total = len(items)
        self.estado["total_registros"] = total
        self._guardar_estado()

        countdown(delay_segundos, "Conectando")
        if not self.conexion_remota():
            self.finalizar_con_error("No se pudo establecer la conexion remota (RDP)")
            return False

        if not self.login_aplicacion():
            self.finalizar_con_error("No se pudo iniciar sesion en la aplicacion")
            return False

        self.coordenadas.update(strategy.get_coordenadas_especificas())

        MAX_FALLOS_CONSECUTIVOS = 3
        fallos_consecutivos = 0
        detenido = False

        for i, item in enumerate(items):
            num = i + 1
            pct = 15 + int((num / total) * 80) if total else 100
            item_id = str(item.get("id", f"item_{i}"))

            control = self._verificar_control(item_id)
            if control == "detener":
                detenido = True
                self.finalizar_con_error("Detenido por el usuario")
                break
            if control == "saltar":
                self.estado["registros_saltados"] += 1
                self.estado["items_saltados"].append(item_id)
                self._registrar_detalle(item_id, item, "saltado")
                self._guardar_estado()
                continue

            self.actualizar_progreso(f"[{num}/{total}] Procesando {item_id}", pct)
            self._registrar_detalle(item_id, item, "en_proceso")

            data = strategy.preparar_dato(item)
            exito = False
            for intento in range(1, MAX_REINTENTOS_REGISTRO + 1):
                if intento > 1:
                    _print(f"    Reintento {intento} para {item_id}...")
                    strategy.navegar_hasta_modulo(self)
                    data = strategy.preparar_dato(item)
                try:
                    ok = strategy.registrar_registro(self, data)
                    if ok and strategy.verificar_registro(self, data):
                        exito = True
                        break
                except Exception as e:
                    _print(f"    Excepcion en intento {intento}: {e}")
                    self.agregar_screenshot(self.tomar_screenshot(f"error_{item_id}_int{intento}"))

            if exito:
                fallos_consecutivos = 0
                self.estado["registros_exitosos"] += 1
                self.estado["items_cargados"].append(item_id)
                self._registrar_detalle(item_id, item, "completado")
                _print(f"    OK: {item_id}")
            else:
                fallos_consecutivos += 1
                self.estado["registros_fallidos"] += 1
                self.estado["items_fallidos"].append(item_id)
                self._registrar_detalle(item_id, item, "fallido",
                                        error=f"Fallo tras {MAX_REINTENTOS_REGISTRO} intentos")
                _print(f"    FALLIDO: {item_id}")
                if fallos_consecutivos >= MAX_FALLOS_CONSECUTIVOS:
                    self.finalizar_con_error(
                        f"CORTACIRCUITO: {fallos_consecutivos} items fallidos seguidos "
                        f"(pantalla bloqueada / popup sin resolver?). Corrida abortada."
                    )
                    return False

            strategy.limpiar_formulario(self)
            self._guardar_estado()

        if detenido:
            return False

        self.finalizar_con_exito()
        return True

    # ================================================================
    # Secciones individuales (útil para probar un paso a la vez)
    # ================================================================

    def ejecutar_seccion(self, seccion: str, strategy=None,
                         delay_segundos: int = 8, items: List[dict] = None) -> bool:
        _print(f"\n  Ejecutando seccion: {seccion}")

        if seccion == "conexion":
            countdown(delay_segundos, "Conectando")
            return self.conexion_remota()
        elif seccion == "login":
            countdown(delay_segundos, "Login")
            return self.login_aplicacion()
        elif seccion == "navegar" and strategy:
            self.coordenadas.update(strategy.get_coordenadas_especificas())
            countdown(delay_segundos, "Navegando")
            return strategy.navegar_hasta_modulo(self)
        elif seccion == "registrar" and strategy and items:
            self.coordenadas.update(strategy.get_coordenadas_especificas())
            countdown(delay_segundos, "Registrando 1 item de prueba")
            data = strategy.preparar_dato(items[0])
            return strategy.registrar_registro(self, data)
        elif seccion == "cerrar":
            return self.cerrar_aplicacion()
        elif seccion == "limpiar_entorno":
            return self.limpiar_entorno_rdp()
        elif seccion == "cerrar_rdp":
            return self.cerrar_conexion_remota()
        else:
            _print(f"  Seccion no valida: {seccion}")
            return False

    # ================================================================
    # Menu interactivo
    # ================================================================

    def loop_interactivo(self):
        while True:
            _print(f"\n{'='*55}")
            _print("  BOT - REGISTRO DE DATOS")
            _print(f"{'='*55}")
            _print("\n  Tareas disponibles:")
            for code, info in self.estrategias_disponibles.items():
                _print(f"    [{code}] {info['name']}")
            _print(f"\n  Opciones:")
            _print(f"    T  = Test seccion individual")
            _print(f"    0  = Salir")

            opcion = input("\n  > Opcion: ").strip().upper()

            if opcion == "0":
                break
            elif opcion == "T":
                secciones = ["conexion", "login", "navegar", "registrar", "cerrar", "cerrar_rdp"]
                _print(f"  Secciones: {', '.join(secciones)}")
                seccion = input("  Seccion: ").strip().lower()
                strategy = None
                if seccion in ("navegar", "registrar"):
                    code = input("  Codigo de tarea: ").strip()
                    cls = get_strategy_cls_by_code(code)
                    if cls:
                        strategy = cls()
                self.ejecutar_seccion(seccion, strategy=strategy)
            else:
                _print(f"  Opcion no reconocida: {opcion}")
