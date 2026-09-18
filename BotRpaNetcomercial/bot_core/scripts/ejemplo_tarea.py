"""
EJEMPLO REAL de una tarea (Strategy) — con secuencia concreta y funcional,
no solo comentarios. Las coordenadas de abajo son INVENTADAS (marcadas con
"# FICTICIA") — reemplázalas por las tuyas, mapeadas con
`ver_coordenadas.py` o `mapear_formulario.py` sobre TU pantalla real.

La secuencia que sigue este ejemplo (mezcla de "escribir + Enter" que avanza
solo, con algunos campos que sí necesitan clic explícito) es exactamente la
técnica que se usó en el bot de referencia del que sale este esqueleto — es
así como suelen comportarse los formularios de apps de escritorio Windows,
no es específico de ninguna aplicación en particular.

Cómo mapear tus propias coordenadas:
  1. Abre tu sesión RDP en la pantalla que quieres automatizar.
  2. Corre `python ver_coordenadas.py` (mueve el mouse y anota x,y), o
     `python mapear_formulario.py` (te guía campo por campo y te arma el
     diccionario listo para pegar aquí).
"""

import time
import pyautogui
from ..core.strategy_base import RegistroStrategy
from ..core.registry import register


@register(
    code="1",
    name="Ejemplo de Formulario",
    description="Plantilla de referencia con una secuencia real — adáptala a tu pantalla"
)
class EjemploFormularioStrategy(RegistroStrategy):

    def get_nombre(self) -> str:
        return "Ejemplo de Formulario"

    def get_coordenadas_especificas(self) -> dict:
        """Coordenadas propias de ESTA pantalla (las de conexión/login van
        aparte, en COORDENADAS_COMUNES de config.py)."""
        return {
            'boton_nuevo': (102, 703),        # FICTICIA
            'campo_categoria': (860, 131),     # FICTICIA — combo/dropdown
            'campo_monto': (696, 426),         # FICTICIA — necesita clic explícito
            'campo_observaciones': (670, 472),  # FICTICIA — texto largo, se pega
            'boton_guardar': (401, 700),        # FICTICIA
            'popup_confirmar_guardar': (672, 429),  # FICTICIA
        }

    def navegar_hasta_modulo(self, bot) -> bool:
        """Desde el menú principal, llega hasta la pantalla de este formulario."""
        try:
            # Ejemplo: abrir un menú y su submenú (ajusta a tu app real).
            # bot.click_coordenada('menu_principal')
            # time.sleep(1)
            # bot.click_coordenada('submenu_mi_formulario')
            # time.sleep(2)
            bot.click_coordenada('boton_nuevo')
            time.sleep(1)
            return True
        except Exception as e:
            print(f"    Error navegando al modulo: {e}", flush=True)
            return False

    def registrar_registro(self, bot, data: dict) -> bool:
        """Llena el formulario con `data` y graba.

        `data` es un dict de tu propia lista de trabajo, ej:
        {"id": "1", "codigo": "A001", "categoria": "GENERAL",
         "monto": 150.50, "observaciones": "Nota larga del registro..."}
        """
        try:
            # --- Campo 1: se escribe y Enter avanza solo al siguiente ---
            codigo = data.get('codigo', '')
            if codigo:
                pyautogui.write(str(codigo), interval=0.03)
                time.sleep(0.2)
                pyautogui.press('enter')
                time.sleep(0.5)
                # El cursor ya quedó posicionado en el siguiente campo —
                # esto es lo normal en formularios de escritorio: no le
                # pongas coordenada a un campo que ya llega por auto-avance.

            # --- Campo 2: un combo/dropdown, sí necesita clic explícito ---
            categoria = data.get('categoria', '')
            if categoria:
                bot.click_coordenada('campo_categoria')
                time.sleep(0.3)
                pyautogui.write(str(categoria), interval=0.03)
                time.sleep(0.2)
                pyautogui.press('enter')
                time.sleep(0.5)

            # --- Campo 3: Monto — clic + doble clic para seleccionar el
            # contenido existente antes de sobreescribir (patrón real usado
            # en producción: un solo clic a veces no selecciona el valor
            # previo, y `write` se concatena en vez de reemplazar) ---
            monto = data.get('monto', 0)
            if monto:
                bot.click_coordenada('campo_monto')
                time.sleep(0.2)
                pyautogui.doubleClick(*bot.coordenadas['campo_monto'])
                time.sleep(0.3)
                pyautogui.write(str(monto), interval=0.05)
                time.sleep(0.2)
                pyautogui.press('enter')
                time.sleep(0.3)

            # --- Campo 4: texto largo/con tildes — usar pegar_texto(), no
            # pyautogui.write() (falla o se come caracteres en RDP) ---
            observaciones = data.get('observaciones', '')
            if observaciones:
                bot.click_coordenada('campo_observaciones')
                time.sleep(0.3)
                bot.pegar_texto(observaciones)

            # --- Screenshot antes de grabar (auditoría — muy recomendable) ---
            bot.tomar_screenshot(f"pregrabar_{data.get('id', 'x')}")

            # --- Grabar + confirmar popup ---
            bot.click_coordenada('boton_guardar')
            time.sleep(1)

            if self.validar_pantalla('confirmar_guardado.png'):
                bot.click_coordenada('popup_confirmar_guardar')
                time.sleep(1.5)
            else:
                # No se detectó el popup esperado: mejor devolver False y que
                # el registro se marque para revisar, que darlo por bueno
                # sin estar seguro (el costo de un falso "ok" es mucho más
                # alto que el de una alarma de más).
                print("    No se detecto el popup de confirmacion", flush=True)
                return False

            return True

        except Exception as e:
            print(f"    Error registrando: {e}", flush=True)
            return False

    def limpiar_formulario(self, bot) -> bool:
        """Deja el formulario listo para el siguiente registro."""
        # Ejemplo: si tu app requiere volver a hacer clic en "Nuevo" entre
        # un registro y el siguiente:
        # bot.click_coordenada('boton_nuevo')
        # time.sleep(1)
        return True
