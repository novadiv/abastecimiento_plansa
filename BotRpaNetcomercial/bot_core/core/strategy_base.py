from abc import ABC, abstractmethod
from pathlib import Path
from typing import List

import pyautogui

# Carpeta con imágenes de validación (relativa a la raíz del bot)
_IMG_DIR = Path(__file__).resolve().parent.parent.parent / "img-validar"


class RegistroStrategy(ABC):
    """Clase abstracta para tareas de registro/automatización.

    Cada tarea concreta (una pantalla, un formulario, un proceso distinto)
    hereda de esta clase e implementa la lógica específica de llenado.
    """

    @abstractmethod
    def get_nombre(self) -> str:
        """Nombre legible de la tarea."""
        ...

    @abstractmethod
    def get_coordenadas_especificas(self) -> dict:
        """Coordenadas específicas de la pantalla de esta tarea."""
        ...

    @abstractmethod
    def navegar_hasta_modulo(self, bot) -> bool:
        """Navega desde el menú principal hasta el módulo/pantalla de la tarea."""
        ...

    @abstractmethod
    def registrar_registro(self, bot, data: dict) -> bool:
        """Llena el formulario con los datos y clickea guardar.

        Args:
            bot: Instancia del bot con métodos de automatización
            data: Dict con los campos del registro (del payload)

        Returns:
            True si el registro se guardó correctamente
        """
        ...

    def verificar_registro(self, bot, data: dict) -> bool:
        """Verifica que el registro se guardó (ej: buscar error dialog).
        Default: confía en que save funcionó."""
        return True

    def limpiar_formulario(self, bot) -> bool:
        """Limpia el formulario para el siguiente registro (ej: click Nuevo).
        Default: no-op."""
        return True

    def get_campos_requeridos(self) -> List[str]:
        """Campos requeridos en el dict de data para esta tarea."""
        return []

    def preparar_dato(self, data: dict) -> dict:
        """Hook para transformar/validar data antes de registrar.
        Default: retorna data sin cambios."""
        return data

    def validar_pantalla(self, nombre_imagen: str, confianza: float = 0.85) -> bool:
        """Busca una imagen de validación en la pantalla.

        Carga la imagen con PIL para evitar el problema de OpenCV con rutas
        que contienen caracteres no-ASCII (ej: tildes en el path).

        Args:
            nombre_imagen: Nombre del archivo (ej: 'validar-antes-nuevo-fase-1.png')
            confianza: Nivel de confianza 0-1 para la búsqueda (default 0.85)

        Returns:
            True si la imagen se encontró en pantalla, False si no.
        """
        from PIL import Image
        img_path = _IMG_DIR / nombre_imagen
        if not img_path.exists():
            print(f"    ADVERTENCIA: Imagen de validacion no encontrada: {img_path}", flush=True)
            return False
        try:
            imagen = Image.open(img_path)
            if imagen.mode == 'RGBA':
                imagen = imagen.convert('RGB')
            ubicacion = pyautogui.locateOnScreen(imagen, confidence=confianza)
            return ubicacion is not None
        except Exception as e:
            print(f"    Error buscando imagen {nombre_imagen}: {e}", flush=True)
            return False
