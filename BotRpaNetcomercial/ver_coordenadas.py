"""
Herramienta para capturar coordenadas de pantalla.

Mueve el mouse por la pantalla y muestra las coordenadas en tiempo real.
Presiona Ctrl+C para salir.

Uso:
    1. Abre tu sesión RDP con la aplicación que quieres automatizar
    2. Navega hasta la pantalla que te interesa
    3. Ejecuta este script
    4. Mueve el mouse a cada campo y anota las coordenadas
"""

import pyautogui
import time
import sys

print("=" * 55)
print("  CAPTURADOR DE COORDENADAS")
print("  Mueve el mouse al campo deseado y anota (x, y)")
print("  Presiona Ctrl+C para salir")
print("=" * 55)
print()

try:
    while True:
        x, y = pyautogui.position()
        print(f"\r  Mouse: ({x:4d}, {y:4d})  ", end="", flush=True)
        time.sleep(0.1)
except KeyboardInterrupt:
    print("\n\n  Saliendo...")
