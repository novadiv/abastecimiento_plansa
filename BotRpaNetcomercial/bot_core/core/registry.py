import importlib
import pkgutil
from typing import Dict, Any, Callable, List, Optional, Type
from .strategy_base import RegistroStrategy

_registry: Dict[str, Dict[str, Any]] = {}


def register(code: str, name: str, description: str = "") -> Callable:
    """Decorador para registrar una tarea de automatización.

    Ejemplo:
        @register(code="1", name="Mi Formulario")
        class MiFormularioStrategy(RegistroStrategy):
            ...
    """
    def _decorator(cls: Type[RegistroStrategy]) -> Type[RegistroStrategy]:
        _registry[code] = {
            "code": code,
            "name": name,
            "description": description,
            "class": cls,
        }
        return cls
    return _decorator


def load_all_tasks():
    """Importa todos los módulos de bot_core.scripts para ejecutar los @register."""
    import bot_core.scripts as scripts_pkg
    for m in pkgutil.iter_modules(scripts_pkg.__path__, scripts_pkg.__name__ + "."):
        importlib.import_module(m.name)


def get_registry() -> Dict[str, Dict[str, Any]]:
    return dict(sorted(_registry.items(), key=lambda kv: kv[0]))


def get_strategy_cls_by_code(code: str) -> Optional[Type[RegistroStrategy]]:
    entry = _registry.get(code)
    return entry["class"] if entry else None


def get_catalog() -> List[Dict[str, str]]:
    return [{"code": c, "name": v["name"], "description": v.get("description", "")}
            for c, v in get_registry().items()]
