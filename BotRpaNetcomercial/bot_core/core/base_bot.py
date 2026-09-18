"""
Bot base para automatización de una aplicación de escritorio vía RDP + pyautogui.

Contiene la lógica de bajo nivel: conexión RDP, login, clicks por coordenada
e imagen, screenshots, y helpers de escritura para formularios.

Esqueleto genérico — adapta `login_aplicacion` / `cerrar_aplicacion` a TU
aplicación (nombre de proceso, imágenes de ícono/login propias, etc.).
"""

import os
import sys
import time
import subprocess
from pathlib import Path
from datetime import datetime

import pyautogui
import pyperclip

from ..commons.config import (
    CARPETA_IMAGENES, CARPETA_SCREENSHOTS,
    COORDENADAS_COMUNES, USUARIO, PASSWORD,
)

# Config pyautogui (idéntico al bot de referencia)
pyautogui.FAILSAFE = True
# Parada de emergencia en CUALQUIER esquina (por defecto solo era la sup-izq;
# el operador intentó la sup-derecha y no disparó — incidente 2026-07-14).
_W, _H = pyautogui.size()
pyautogui.FAILSAFE_POINTS = [(0, 0), (_W - 1, 0), (0, _H - 1), (_W - 1, _H - 1)]
pyautogui.PAUSE = 0.5  # 0.5s como en el bot de referencia


def _print(*args, **kwargs):
    """Print con flush para logging en tiempo real. Safe para Windows cp1252."""
    kwargs.setdefault("flush", True)
    try:
        print(*args, **kwargs)
    except UnicodeEncodeError:
        # Fallback: reemplazar caracteres no imprimibles
        text = " ".join(str(a) for a in args)
        print(text.encode("ascii", "replace").decode(), flush=True)


class BaseBot:
    """Capa base de automatización de UI (RDP + pyautogui)."""

    def __init__(self):
        self.carpeta_imagenes = Path(CARPETA_IMAGENES)
        self.carpeta_screenshots = Path(CARPETA_SCREENSHOTS)
        self.carpeta_screenshots.mkdir(parents=True, exist_ok=True)
        self.coordenadas = dict(COORDENADAS_COMUNES)
        self.usuario = USUARIO
        self.password = PASSWORD
        _print(f"  Bot iniciado. Resolucion: {pyautogui.size()}")
        _print(f"  FAILSAFE activado: mueve el mouse a CUALQUIER esquina para detener")

    # ================================================================
    # Utilidades de imagen
    # ================================================================

    def _ruta_imagen(self, nombre: str) -> str:
        """Retorna la ruta completa a una imagen de referencia."""
        if not nombre.endswith(".png"):
            nombre += ".png"
        return str(self.carpeta_imagenes / nombre)

    def click_imagen(self, nombre_imagen: str, confianza: float = 0.84,
                     imagenes_alternativas: list = None, timeout: int = 0) -> bool:
        """Busca una imagen en pantalla y hace click en ella."""
        imagenes = [nombre_imagen]
        if imagenes_alternativas:
            imagenes.extend(imagenes_alternativas)

        start = time.time()
        while True:
            for img in imagenes:
                ruta = self._ruta_imagen(img)
                if not os.path.exists(ruta):
                    continue
                try:
                    ubicacion = pyautogui.locateCenterOnScreen(ruta, confidence=confianza)
                    if ubicacion:
                        pyautogui.click(ubicacion)
                        _print(f"  Click en imagen: {img}")
                        return True
                except Exception:
                    pass

            if timeout <= 0 or (time.time() - start) > timeout:
                break
            time.sleep(0.5)

        _print(f"  Imagen no encontrada: {nombre_imagen}")
        return False

    def click_imagen_con_reintentos(self, nombre_imagen: str,
                                     imagenes_alternativas: list = None,
                                     confianza: float = 0.84,
                                     reintentos: int = 3,
                                     espera_entre_reintentos: float = 1.3) -> bool:
        """Busca imagen con reintentos (idéntico al bot de referencia).

        Intenta múltiples veces encontrar y clickear una imagen, con pausas
        entre intentos para dar tiempo a que la UI responda.
        """
        imagenes_a_probar = [nombre_imagen] + (imagenes_alternativas or [])
        for intento in range(reintentos):
            _print(f"  Intento {intento + 1} de {reintentos}")
            for img in imagenes_a_probar:
                ruta_imagen = self._ruta_imagen(img)
                if not os.path.exists(ruta_imagen):
                    continue
                try:
                    ubicacion = pyautogui.locateOnScreen(ruta_imagen, confidence=confianza)
                    if ubicacion:
                        centro = pyautogui.center(ubicacion)
                        _print(f"  '{img}' encontrada en: {centro}")
                        pyautogui.click(centro)
                        return True
                except Exception:
                    pass
            if intento < reintentos - 1:
                _print(f"  Esperando {espera_entre_reintentos}s antes del siguiente intento...")
                time.sleep(espera_entre_reintentos)
        return False

    def click_coordenada(self, nombre_coord: str, raise_if_missing: bool = False) -> bool:
        """Hace click en una coordenada predefinida por nombre."""
        coord = self.coordenadas.get(nombre_coord)
        if not coord:
            msg = f"Coordenada no definida: {nombre_coord}"
            if raise_if_missing:
                raise ValueError(msg)
            _print(f"  WARN: {msg}")
            return False
        pyautogui.click(coord[0], coord[1])
        _print(f"  Click: {nombre_coord} ({coord[0]}, {coord[1]})")
        return True

    def esperar_hasta_imagen(self, imagen: str, timeout: int = 30,
                             confianza: float = 0.8) -> bool:
        """Espera hasta que una imagen aparezca en pantalla."""
        _print(f"  Esperando imagen: {imagen} (max {timeout}s)")
        start = time.time()
        while (time.time() - start) < timeout:
            try:
                if pyautogui.locateCenterOnScreen(
                    self._ruta_imagen(imagen), confidence=confianza
                ):
                    _print(f"  Imagen encontrada: {imagen}")
                    return True
            except Exception:
                pass
            time.sleep(0.5)
        _print(f"  Timeout esperando: {imagen}")
        return False

    def verificar_pantalla(self, imagen_referencia: str, confianza: float = 0.7) -> bool:
        """Verifica si una imagen está visible en pantalla (sin click)."""
        try:
            return pyautogui.locateCenterOnScreen(
                self._ruta_imagen(imagen_referencia), confidence=confianza
            ) is not None
        except Exception:
            return False

    def tomar_screenshot(self, nombre: str = "") -> str:
        """Captura screenshot y retorna la ruta."""
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        nombre = nombre or "screenshot"
        nombre_limpio = nombre.replace(" ", "_").replace("/", "_")
        ruta = self.carpeta_screenshots / f"{nombre_limpio}_{ts}.png"
        try:
            pyautogui.screenshot(str(ruta))
            _print(f"  Screenshot: {ruta.name}")
        except Exception as e:
            _print(f"  Error en screenshot: {e}")
            return ""
        return str(ruta)

    # ================================================================
    # Ventanas emergentes (idéntico al bot de referencia)
    # ================================================================

    def _cerrar_ventanas_emergentes(self) -> bool:
        """Verifica y cierra ventanas emergentes de Windows.

        Se ejecuta automáticamente en cada pausa_con_mensaje().
        Imágenes requeridas en carpeta imagenes/:
        - advertencia_windows_1.png
        - ventana_activar_windows.png
        """
        ventanas_emergentes = [
            "advertencia_windows_1",
            "ventana_activar_windows",
        ]
        cerro_alguna = False
        for img in ventanas_emergentes:
            ruta = self._ruta_imagen(img)
            if not os.path.exists(ruta):
                continue
            try:
                ubicacion = pyautogui.locateOnScreen(ruta, confidence=0.8)
                if ubicacion:
                    _print(f"\n  VENTANA EMERGENTE DETECTADA: {img}")
                    _print(f"  Cerrando con Enter...")
                    pyautogui.press('enter')
                    time.sleep(1)
                    cerro_alguna = True
                    _print(f"  Ventana cerrada")
            except Exception:
                pass
        return cerro_alguna

    # ================================================================
    # Helpers de escritura (para formularios la aplicación)
    # ================================================================

    def liberar_todas_las_teclas(self):
        """Libera teclas que pueden haber quedado presionadas (idéntico al bot de referencia)."""
        _print("  Liberando todas las teclas pegadas...")
        teclas_modificadoras = ['shift', 'ctrl', 'alt', 'win', 'cmd']
        for tecla in teclas_modificadoras:
            try:
                pyautogui.keyUp(tecla)
            except Exception:
                pass
        teclas_comunes = ['tab', 'enter', 'space', 'esc']
        for tecla in teclas_comunes:
            try:
                pyautogui.keyUp(tecla)
            except Exception:
                pass
        # Presionar ESC 3 veces como en el bot de referencia
        for _ in range(3):
            pyautogui.press('esc')
            time.sleep(0.1)
        _print("  Teclas liberadas correctamente")

    def pausa_con_mensaje(self, mensaje: str, segundos: float = 2):
        """Pausa con verificación de ventanas emergentes (idéntico al bot de referencia).

        Verifica emergentes al inicio Y al final de cada pausa, exactamente
        como lo hace el bot de referencia para no perder ningún popup.
        """
        _print(f"  {mensaje} ({segundos}s)")
        sys.stdout.flush()
        # Verificar ventanas emergentes al inicio
        self._cerrar_ventanas_emergentes()
        time.sleep(segundos)
        # Verificar de nuevo al final (por si apareció durante la espera)
        self._cerrar_ventanas_emergentes()

    def escribir_barra(self):
        """Escribe / usando shift+7 (teclado español, funciona en RDP)."""
        pyautogui.keyDown('shift'); time.sleep(0.1)
        pyautogui.press('7'); time.sleep(0.1)
        pyautogui.keyUp('shift')

    def escribir_dos_puntos(self):
        pyautogui.hotkey('shift', ';')

    def escribir_comillas(self):
        """Escribe " usando shift+2 (teclado español, funciona en RDP)."""
        pyautogui.keyDown('shift'); time.sleep(0.1)
        pyautogui.press('2'); time.sleep(0.1)
        pyautogui.keyUp('shift')

    def escribir_porcentaje(self):
        """Escribe % usando shift+5 (teclado español, funciona en RDP)."""
        pyautogui.keyDown('shift'); time.sleep(0.1)
        pyautogui.press('5'); time.sleep(0.1)
        pyautogui.keyUp('shift')

    def escribir_barra_inv(self):
        pyautogui.press('\\')

    # ================================================================
    # Helpers NUEVOS para registro de datos
    # ================================================================

    def escribir_en_campo(self, nombre_coord: str, texto: str, limpiar: bool = True):
        """Click en un campo, opcionalmente limpia, y escribe texto."""
        if not texto:
            return
        self.click_coordenada(nombre_coord)
        time.sleep(0.2)
        if limpiar:
            pyautogui.hotkey('ctrl', 'a')
            time.sleep(0.1)
            pyautogui.press('delete')
            time.sleep(0.1)
        pyautogui.write(str(texto), interval=0.02)

    def seleccionar_combo(self, nombre_coord: str, valor: str):
        """Click en un combo/dropdown, escribe el valor y presiona Enter."""
        if not valor:
            return
        self.click_coordenada(nombre_coord)
        time.sleep(0.3)
        pyautogui.hotkey('ctrl', 'a')
        pyautogui.press('delete')
        time.sleep(0.1)
        pyautogui.write(str(valor), interval=0.02)
        time.sleep(0.3)
        pyautogui.press('enter')
        time.sleep(0.2)

    def tab_siguiente(self):
        """Presiona Tab para mover al siguiente campo."""
        pyautogui.press('tab')
        time.sleep(0.15)

    def pegar_texto(self, texto: str):
        """Escribe texto vía portapapeles (Ctrl+V) — NO uses `pyautogui.write`
        para textos largos o con tildes/mayúsculas si te falla en RDP.

        Lección aprendida en producción, generalizable a cualquier bot RDP:
        - `pyautogui.hotkey('ctrl', 'v')` a veces solo envía la 'v' sola en
          sesiones RDP (se pierde el Ctrl). Por eso aquí se hace
          keyDown/press/keyUp explícito en vez de hotkey().
        - Fijar el portapapeles con PowerShell `Set-Clipboard` ADEMÁS de
          `pyperclip.copy()` (uno de los dos falla silenciosamente a veces).
        - Se verifica que el portapapeles realmente tenga el texto antes de
          pegar, reintentando si no coincide.
        - Se liberan las teclas modificadoras antes de pegar: si quedó algo
          presionado de un paso anterior, el Ctrl+V no llega a la app.
        """
        if not texto:
            return
        texto_str = str(texto)
        texto_safe = texto_str.replace("'", "''")

        subprocess.run(
            ['powershell', '-command', f"Set-Clipboard -Value '{texto_safe}'"],
            capture_output=True, timeout=5
        )
        time.sleep(0.3)
        pyperclip.copy("")
        time.sleep(0.1)
        pyperclip.copy(texto_str)
        time.sleep(0.5)

        try:
            result = subprocess.run(
                ['powershell', '-command', 'Get-Clipboard'],
                capture_output=True, text=True, timeout=3
            )
            clip = result.stdout.strip() if result.returncode == 0 else ""
            if texto_str not in clip:
                _print("    ADVERTENCIA: clipboard no coincide, reintentando...")
                pyperclip.copy(texto_str)
                time.sleep(1.0)
        except Exception:
            pass

        for key in ['ctrl', 'shift', 'alt']:
            try:
                pyautogui.keyUp(key)
            except Exception:
                pass
        time.sleep(0.2)

        pyautogui.keyDown('ctrl')
        time.sleep(0.5)
        pyautogui.press('v')
        time.sleep(0.3)
        pyautogui.keyUp('ctrl')
        time.sleep(1.0)

    # ================================================================
    # Conexión RDP
    # ================================================================

    def conexion_remota(self) -> bool:
        """Establece conexión RDP al servidor con la aplicación.

        Flujo idéntico al bot de referencia:
        1. Liberar teclas pegadas
        2. Minimizar todo (Win+M)
        3. Buscar imagen de conexión remota con reintentos
        4. Doble click + Enter para conectar
        5. Esperar 7 segundos para que cargue RDP
        6. Cerrar ventana de Windows (si existe)
        7. Cerrar ventana de PDF Creator (si existe)
        """
        _print("\n" + "=" * 55)
        _print("  PASO 1: CONEXION REMOTA")
        _print("=" * 55)
        try:
            # 1. Liberar teclas pegadas (crítico para evitar combinaciones accidentales)
            self.liberar_todas_las_teclas()

            # 2. Minimizar todas las ventanas (Win+M, no Win+D)
            self.pausa_con_mensaje("Minimizando todas las ventanas")
            pyautogui.hotkey('win', 'm')

            # 3. Buscar imagen de conexión remota con reintentos
            self.pausa_con_mensaje("Buscando imagen de conexion remota")
            if not self.click_imagen_con_reintentos(
                "paso_1-conex-remote",
                imagenes_alternativas=["paso_1-conex-remote-hover", "paso_1-conex-remote-selected"],
                reintentos=3,
                espera_entre_reintentos=1.3
            ):
                _print("  No se encontro la imagen de conexion")
                self.tomar_screenshot("error_conexion_no_imagen")
                return False

            # 4. Doble click para abrir + Enter
            self.pausa_con_mensaje("Doble click para abrir")
            pyautogui.doubleClick()
            self.pausa_con_mensaje("Presionando Enter")
            pyautogui.press('enter')

            # 5. Esperar 7 segundos para que el RDP cargue completamente
            # (CRÍTICO: este tiempo está calibrado para la latencia del servidor)
            _print("\n  Cerrando ventana emergente de Windows (si existe)...")
            self.pausa_con_mensaje("Esperando que cargue el RDP completamente", 7)

            # 6. Cerrar ventana de Windows (doble click como en referencia)
            if 'cerrar_windows' in self.coordenadas:
                self.click_coordenada('cerrar_windows')
                time.sleep(0.5)
                self.click_coordenada('cerrar_windows')
                time.sleep(1)
                _print("  Clicks en cerrar_windows ejecutados")
            else:
                _print("  Coordenada 'cerrar_windows' no definida, usando ESC")
                pyautogui.press('esc')
                time.sleep(0.5)
                pyautogui.press('esc')
                time.sleep(1)

            # 7. Cerrar ventana de PDF Creator (si existe)
            if 'cerrar_pdf_creator' in self.coordenadas:
                _print("\n  Cerrando ventana de PDF Creator (si existe)...")
                self.click_coordenada('cerrar_pdf_creator')
                time.sleep(0.5)
                self.click_coordenada('cerrar_pdf_creator')
                time.sleep(1)
                _print("  Clicks en cerrar_pdf_creator ejecutados")

            _print("  CONEXION REMOTA COMPLETADA")
            self.tomar_screenshot("conexion_remota_completada")
            return True

        except Exception as e:
            _print(f"  Error en conexion remota: {e}")
            self.tomar_screenshot("error_conexion_remota")
            return False

    # ================================================================
    # Login la aplicación (REPLICADO EXACTAMENTE del bot de referencia)
    # ================================================================

    def login_aplicacion(self) -> bool:
        """Login en la aplicación la aplicación.

        Flujo idéntico al bot de referencia:
        1. Win+D para mostrar escritorio
        2. Buscar icono la aplicación con confianza decreciente (0.8, 0.7, 0.6)
        3. Si no se encuentra, buscar desde Windows Search
        4. Doble click para abrir + click en "Ejecutar la aplicación"
        5. Esperar hasta 30 segundos por la ventana de login
        6. Escribir usuario + Tab + password
        7. Triple Enter para confirmar
        """
        _print("\n" + "=" * 55)
        _print("  PASO 2: LOGIN LA APLICACION")
        _print("=" * 55)
        try:
            # 1. Mostrar escritorio
            self.pausa_con_mensaje("Mostrando escritorio", 2)
            pyautogui.hotkey('win', 'd')
            time.sleep(2)

            # 2. Buscar icono con confianza decreciente (como el bot de referencia)
            self.pausa_con_mensaje("Buscando imagen de LA APLICACION")
            ubicacion = None
            for confianza in [0.8, 0.7, 0.6]:
                _print(f"  Intentando con confianza {confianza}...")
                try:
                    ubicacion = pyautogui.locateOnScreen(
                        self._ruta_imagen("icono_app"),
                        confidence=confianza
                    )
                    if ubicacion:
                        _print(f"  Icono encontrado con confianza {confianza}")
                        centro = pyautogui.center(ubicacion)
                        break
                except Exception:
                    _print(f"  No encontrado con confianza {confianza}")
                    continue

            # 3. Si no se encuentra, buscar desde Windows Search
            if not ubicacion:
                _print("  Icono no encontrado, intentando abrir desde busqueda de Windows...")
                pyautogui.press('win')
                time.sleep(1)
                pyautogui.write('tu_aplicacion', interval=0.1)  # TODO: nombre real de tu app en Windows Search
                time.sleep(2)
                pyautogui.press('enter')
                time.sleep(8)
            else:
                # Click en icono con reintentos
                if not self.click_imagen_con_reintentos(
                    "icono_app",
                    imagenes_alternativas=["icono_app-hover", "icono_app-selected"],
                    reintentos=3,
                    espera_entre_reintentos=1.3
                ):
                    _print("  No se encontro la imagen de LA APLICACION")
                    return False

            # 4. Doble click para abrir + Ejecutar la aplicación
            self.pausa_con_mensaje("Doble click para abrir la aplicación")
            pyautogui.doubleClick()
            time.sleep(1)
            self.pausa_con_mensaje("Click en ejecutar la aplicación")
            self.click_coordenada('ejecutar_net')

            # 5. Esperar ventana de login (hasta 30 segundos, como el bot de referencia)
            self.pausa_con_mensaje("Esperando ventana de login...")
            login_visible = False
            for intento in range(30):
                try:
                    ubicacion = pyautogui.locateOnScreen(
                        self._ruta_imagen("login_user_pass"),
                        confidence=0.8
                    )
                    if ubicacion:
                        _print(f"  Ventana de login detectada (intento {intento + 1})")
                        login_visible = True
                        break
                except Exception:
                    pass
                _print(f"  Esperando ventana de login... ({intento + 1}/30)")
                time.sleep(1)

            if not login_visible:
                _print("  Ventana de login no detectada, continuando de todos modos...")

            # 6. Escribir credenciales (como el bot de referencia)
            time.sleep(1)  # Espera 1s después de detectar
            self.pausa_con_mensaje("Escribiendo usuario")
            pyautogui.write(self.usuario)
            self.pausa_con_mensaje("Tab y escribiendo password")
            pyautogui.press('tab')
            time.sleep(0.5)
            pyautogui.write(self.password)

            # 7. Triple Enter (como el bot de referencia)
            self.pausa_con_mensaje("Triple Enter")
            pyautogui.press('enter')
            pyautogui.press('enter')
            pyautogui.press('enter')

            # 8. Verificar que la aplicación abrió su ventana principal
            _print("  Verificando apertura de la aplicación...")
            ventana_ok, icono_ok = self._verificar_net_abierto(espera=15)

            if ventana_ok and icono_ok:
                _print("  LOGIN COMPLETADO — ventana principal e icono confirmados")
                self.tomar_screenshot("login_completado")
                return True

            if ventana_ok or icono_ok:
                # Solo una señal presente → la aplicación puede estar colgado
                _print(f"  ADVERTENCIA: solo {'ventana' if ventana_ok else 'icono'} detectado, posible cuelgue")
                _print("  Cerrando la aplicación y reintentando login...")
                self.tomar_screenshot("login_nc_parcial")
                self.cerrar_aplicacion()
                time.sleep(2)
                return self._reintentar_abrir_y_login()

            # Ninguna señal → no abrió en absoluto
            _print("  la aplicación no abrió tras el login — reintentando...")
            self.tomar_screenshot("login_nc_no_abrio")
            return self._reintentar_abrir_y_login()

        except Exception as e:
            _print(f"  Error en login: {e}")
            self.tomar_screenshot("error_login")
            return False

    def _verificar_net_abierto(self, espera: int = 15) -> tuple:
        """Espera hasta `espera` segundos y comprueba si la aplicación abrió.

        Busca dos señales visuales:
        - validar_net_abrio.png   → ventana principal del menú
        - validar_net_abrio_2.png → icono en la barra de tareas

        Retorna (ventana_ok: bool, icono_ok: bool).
        """
        _print(f"  Verificando apertura de la aplicación (max {espera}s)...")
        ventana_ok = False
        icono_ok = False
        img_ventana = self._ruta_imagen("validar_net_abrio")
        img_icono = self._ruta_imagen("validar_net_abrio_2")
        start = time.time()

        while (time.time() - start) < espera:
            if not ventana_ok and os.path.exists(img_ventana):
                try:
                    if pyautogui.locateCenterOnScreen(img_ventana, confidence=0.75):
                        ventana_ok = True
                        _print("  [OK] ventana principal de la aplicación detectada")
                except Exception:
                    pass

            if not icono_ok and os.path.exists(img_icono):
                try:
                    if pyautogui.locateCenterOnScreen(img_icono, confidence=0.75):
                        icono_ok = True
                        _print("  [OK] icono de la aplicación en taskbar detectado")
                except Exception:
                    pass

            if ventana_ok and icono_ok:
                break
            time.sleep(1)

        if not ventana_ok:
            _print("  [--] ventana principal NO detectada")
        if not icono_ok:
            _print("  [--] icono taskbar NO detectado")
        return (ventana_ok, icono_ok)

    def _reintentar_abrir_y_login(self) -> bool:
        """Reintento único de apertura + login de la aplicación (sin recursión).

        Flujo:
        1. Win+D → escritorio
        2. Buscar icono la aplicación con confianza decreciente
        3. Doble click + click ejecutar_net
        4. Esperar ventana de login (30s)
        5. Escribir credenciales + triple Enter
        6. Verificar apertura (15s)
        7. Retorna True solo si ambas señales (ventana + icono) están presentes
        """
        _print("\n  === REINTENTO DE LOGIN LA APLICACION ===")
        try:
            # 1. Escritorio
            pyautogui.hotkey('win', 'd')
            time.sleep(2)

            # 2. Buscar icono
            _print("  Buscando icono la aplicación para reintento...")
            ubicacion = None
            for confianza in [0.8, 0.7, 0.6]:
                try:
                    ubicacion = pyautogui.locateOnScreen(
                        self._ruta_imagen("icono_app"),
                        confidence=confianza
                    )
                    if ubicacion:
                        _print(f"  Icono encontrado (confianza {confianza})")
                        break
                except Exception:
                    continue

            if not ubicacion:
                _print("  Icono no encontrado en reintento, usando Windows Search...")
                pyautogui.press('win')
                time.sleep(1)
                pyautogui.write('tu_aplicacion', interval=0.1)  # TODO: nombre real de tu app en Windows Search
                time.sleep(2)
                pyautogui.press('enter')
                time.sleep(8)
            else:
                pyautogui.doubleClick(pyautogui.center(ubicacion))
                time.sleep(1)

            # 3. Click en ejecutar_net
            self.pausa_con_mensaje("Click en ejecutar la aplicación (reintento)")
            self.click_coordenada('ejecutar_net')

            # 4. Esperar ventana de login
            self.pausa_con_mensaje("Esperando ventana de login (reintento)...")
            login_visible = False
            for intento in range(30):
                try:
                    if pyautogui.locateOnScreen(
                        self._ruta_imagen("login_user_pass"), confidence=0.8
                    ):
                        _print(f"  Ventana de login detectada (intento {intento + 1})")
                        login_visible = True
                        break
                except Exception:
                    pass
                _print(f"  Esperando login... ({intento + 1}/30)")
                time.sleep(1)

            if not login_visible:
                _print("  Ventana de login no detectada en reintento, continuando...")

            # 5. Credenciales + triple Enter
            time.sleep(1)
            pyautogui.write(self.usuario)
            pyautogui.press('tab')
            time.sleep(0.5)
            pyautogui.write(self.password)
            time.sleep(0.5)
            pyautogui.press('enter')
            pyautogui.press('enter')
            pyautogui.press('enter')

            # 6. Verificar (sin recursión: si falla aquí se reporta el error)
            ventana_ok, icono_ok = self._verificar_net_abierto(espera=15)
            if ventana_ok and icono_ok:
                _print("  REINTENTO EXITOSO — la aplicación abierto correctamente")
                self.tomar_screenshot("reintento_login_ok")
                return True

            _print("  REINTENTO FALLIDO — la aplicación no abrió tras el segundo intento")
            self.tomar_screenshot("reintento_login_fallido")
            return False

        except Exception as e:
            _print(f"  Error en reintento de login: {e}")
            self.tomar_screenshot("error_reintento_login")
            return False

    # ================================================================
    # Cierre de aplicaciones
    # ================================================================

    def cerrar_aplicacion(self) -> bool:
        """Cierra la aplicación DENTRO del servidor RDP via Win+R → cmd → taskkill.

        IMPORTANTE: la aplicación corre en el servidor remoto, no en la máquina
        local. Por eso no podemos usar subprocess.call() — debemos abrir un CMD
        en la sesión RDP y ejecutar taskkill desde ahí.

        Usa el filtro USERNAME eq %USERNAME% para no afectar las sesiones de
        otros usuarios RDP del mismo servidor.
        """
        _print("\n" + "=" * 55)
        _print("  CERRANDO LA APLICACION (dentro del RDP)")
        _print("=" * 55)
        try:
            self.pausa_con_mensaje("Abriendo CMD en la sesion RDP", 1)
            pyautogui.hotkey('win', 'r')
            self.pausa_con_mensaje("Escribiendo cmd")
            pyautogui.write('cmd')
            pyautogui.press('enter')
            time.sleep(1.5)
            self.liberar_todas_las_teclas()

            self.pausa_con_mensaje("Ejecutando taskkill la aplicación.exe (solo mi sesion)")
            # Comando: taskkill /f /im la aplicación.exe /FI "USERNAME eq %USERNAME%"
            pyautogui.write('taskkill ')
            self.escribir_barra(); pyautogui.write('f ')
            self.escribir_barra(); pyautogui.write('im la aplicación.exe ')
            self.escribir_barra(); pyautogui.write('FI ')
            self.escribir_comillas(); pyautogui.write('USERNAME eq ')
            self.escribir_porcentaje(); pyautogui.write('USERNAME')
            self.escribir_porcentaje(); self.escribir_comillas()
            time.sleep(0.3)
            pyautogui.press('enter')
            time.sleep(2)

            self.pausa_con_mensaje("Cerrando CMD", 1)
            pyautogui.write('exit')
            pyautogui.press('enter')
            time.sleep(0.5)

            _print("  la aplicación cerrado")
            self.tomar_screenshot("aplicacion_cerrada")
            return True
        except Exception as e:
            _print(f"  Error al cerrar NC: {e}")
            self.tomar_screenshot("error_cerrar_aplicacion")
            return False

    def cerrar_excel(self) -> bool:
        """Cierra Excel DENTRO del servidor RDP, solo la sesion del usuario actual.

        Usa /FI "USERNAME eq %USERNAME%" igual que cerrar_aplicacion,
        para no afectar los procesos de Excel de otros usuarios en el servidor.
        """
        _print("\n" + "=" * 55)
        _print("  CERRANDO EXCEL (dentro del RDP)")
        _print("=" * 55)
        try:
            self.pausa_con_mensaje("Abriendo CMD en la sesion RDP", 1)
            pyautogui.hotkey('win', 'r')
            self.pausa_con_mensaje("Escribiendo cmd")
            pyautogui.write('cmd')
            pyautogui.press('enter')
            time.sleep(1.5)
            self.liberar_todas_las_teclas()

            self.pausa_con_mensaje("Ejecutando taskkill EXCEL.EXE (solo mi sesion)")
            # Comando: taskkill /f /im EXCEL.EXE /FI "USERNAME eq %USERNAME%"
            pyautogui.write('taskkill ')
            self.escribir_barra(); pyautogui.write('f ')
            self.escribir_barra(); pyautogui.write('im EXCEL.EXE ')
            self.escribir_barra(); pyautogui.write('FI ')
            self.escribir_comillas(); pyautogui.write('USERNAME eq ')
            self.escribir_porcentaje(); pyautogui.write('USERNAME')
            self.escribir_porcentaje(); self.escribir_comillas()
            time.sleep(0.3)
            pyautogui.press('enter')
            time.sleep(2)

            self.pausa_con_mensaje("Cerrando CMD", 1)
            pyautogui.write('exit')
            pyautogui.press('enter')
            time.sleep(0.5)

            _print("  Excel cerrado")
            self.tomar_screenshot("excel_cerrado")
            return True
        except Exception as e:
            _print(f"  Error al cerrar Excel: {e}")
            self.tomar_screenshot("error_cerrar_excel")
            return False

    def limpiar_entorno_rdp(self) -> bool:
        """Cierra Excel + la aplicación dentro del RDP. Garantiza un entorno limpio.

        Se debe llamar tanto al inicio (antes de empezar las tareas) como al
        final (limpieza). El cierre dentro del RDP requiere que ya estemos
        conectados al servidor remoto.
        """
        _print("\n  Limpiando entorno RDP (cerrando Excel + la aplicación)...")
        ok_excel = self.cerrar_excel()
        ok_nc = self.cerrar_aplicacion()
        return ok_excel and ok_nc

    def cerrar_conexion_remota(self) -> bool:
        """Cierra la conexión RDP desde la maquina LOCAL (mstsc.exe es local)."""
        _print("\n  Cerrando conexion remota (mstsc.exe local)...")
        try:
            subprocess.call('taskkill /IM "mstsc.exe" /F >NUL 2>&1', shell=True)
            time.sleep(1)
            _print("  RDP cerrado")
            return True
        except Exception as e:
            _print(f"  Error al cerrar RDP: {e}")
            return False
