"""
Captura screenshots de la sesión RDP para mapeo de coordenadas.

Uso:
    python capturar_pantalla.py

    Presiona Enter para capturar, 'q' para salir.
    Los screenshots se guardan en screenshots/ con nombre descriptivo.
"""

import pyautogui
from datetime import datetime
from pathlib import Path

SCREENSHOTS_DIR = Path("screenshots")
SCREENSHOTS_DIR.mkdir(exist_ok=True)

print("=" * 55)
print("  CAPTURADOR DE SCREENSHOTS")
print("  Presiona Enter para capturar")
print("  Escribe un nombre descriptivo + Enter")
print("  Escribe 'q' para salir")
print("=" * 55)

count = 0
while True:
    nombre = input(f"\n  Nombre del screenshot (o 'q' para salir): ").strip()
    if nombre.lower() == 'q':
        break

    if not nombre:
        nombre = f"screenshot_{count+1}"

    nombre = nombre.replace(" ", "_")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    ruta = SCREENSHOTS_DIR / f"{nombre}_{ts}.png"

    pyautogui.screenshot(str(ruta))
    count += 1

    # Mostrar resolución y coordenadas del mouse
    x, y = pyautogui.position()
    screen = pyautogui.size()
    print(f"  [OK] Guardado: {ruta.name}")
    print(f"       Resolución: {screen.width}x{screen.height}")
    print(f"       Mouse en: ({x}, {y})")

print(f"\n  Total capturas: {count}")
