"""
CLI del bot.

Modos:
    menu  - Menu interactivo
    auto  - Ejecucion por linea de comandos

Ejemplos:
    python run.py --modo menu
    python run.py --modo auto --tarea 1 --accion flujo
    python run.py --listar-json
"""

import argparse
import json
import signal
import sys

from .core.registry import load_all_tasks, get_strategy_cls_by_code, get_catalog
from .core.bot import RegistroBot


def _safe_print(msg):
    """Print seguro para Windows cp1252."""
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode(), flush=True)


def _signal_handler(sig, frame):
    _safe_print("\n  Cancelado por usuario (Ctrl+C)")
    sys.exit(1)


def _cargar_items_ejemplo() -> list:
    """Reemplaza esto por lo que sea que traiga TU lista de trabajo:
    leer un Excel/CSV, llamar a tu propia API, leer un JSON local, etc.
    Cada item es un dict con lo que tu Strategy necesita."""
    return []


def main():
    signal.signal(signal.SIGINT, _signal_handler)

    parser = argparse.ArgumentParser(description="Bot de automatizacion de escritorio (RDP)")
    parser.add_argument(
        "--modo", choices=["menu", "auto"], default="menu",
        help="Modo de ejecucion (default: menu)"
    )
    parser.add_argument("--tarea", help="Codigo de la tarea (ej: 1)")
    parser.add_argument(
        "--accion",
        choices=["flujo", "conexion", "login", "navegar", "registrar", "cerrar", "cerrar_rdp"],
        help="Accion a ejecutar en modo auto"
    )
    parser.add_argument("--delay", type=int, default=8, help="Segundos de espera antes de iniciar")
    parser.add_argument("--job-id", help="ID personalizado para el job")
    parser.add_argument("--jobs-dir", help="Directorio alternativo para jobs")
    parser.add_argument("--listar-json", action="store_true", help="Listar tareas en JSON")

    args = parser.parse_args()

    load_all_tasks()

    if args.listar_json:
        catalog = get_catalog()
        print(json.dumps({
            "tasks": catalog,
            "actions": ["flujo", "conexion", "login", "navegar", "registrar", "cerrar", "cerrar_rdp"]
        }, indent=2, ensure_ascii=False))
        return

    if args.jobs_dir:
        RegistroBot.JOBS_DIR_OVERRIDE = args.jobs_dir

    bot = RegistroBot(job_id=args.job_id)

    if args.modo == "menu":
        bot.loop_interactivo()
        return

    if not args.accion:
        _safe_print("  ERROR: En modo auto debe especificar --accion")
        parser.print_help()
        sys.exit(1)

    strategy = None
    if args.tarea:
        cls = get_strategy_cls_by_code(args.tarea)
        if cls:
            strategy = cls()
        else:
            _safe_print(f"  ERROR: Tarea no encontrada: {args.tarea}")
            _safe_print(f"  Disponibles: {[c['code'] + '-' + c['name'] for c in get_catalog()]}")
            sys.exit(1)

    if args.accion == "flujo":
        if not strategy:
            _safe_print("  ERROR: --tarea es requerido para flujo")
            sys.exit(1)

        items = _cargar_items_ejemplo()
        try:
            ok = bot.ejecutar_lote(strategy, items, delay_segundos=args.delay)
        except Exception as e:
            # Cualquier excepción no controlada debe dejar el job en 'fallido'
            # (no colgado en 'inicializado'), para que quien monitoree el job
            # vea el error y pueda relanzar.
            import traceback
            traceback.print_exc()
            try:
                bot.finalizar_con_error(f"Crash no controlado: {type(e).__name__}: {e}")
            except Exception:
                pass
            sys.exit(1)
        sys.exit(0 if ok else 1)

    ok = bot.ejecutar_seccion(args.accion, strategy=strategy, delay_segundos=args.delay)
    sys.exit(0 if ok else 1)
