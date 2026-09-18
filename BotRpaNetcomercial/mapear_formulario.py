"""
Mapeo guiado de un formulario: te guía campo por campo para capturar las
coordenadas. Para cada campo: mueve el mouse al centro del campo y presiona
Enter. Al final genera el código Python listo para copiar a tu Strategy
(ver bot_core/scripts/ejemplo_tarea.py).

Uso:
    1. Reemplaza la lista CAMPOS de abajo por los campos de TU formulario.
    2. Abre tu sesión RDP en la pantalla que quieres mapear.
    3. Ejecuta: python mapear_formulario.py
    4. Sigue las instrucciones para cada campo.
"""

import pyautogui
import json
from datetime import datetime
from pathlib import Path

# Reemplaza esto por los campos reales de tu formulario.
CAMPOS = [
    ("campo_ejemplo_1", "Descripción del primer campo (ej: NOMBRE)"),
    ("campo_ejemplo_2", "Descripción del segundo campo (ej: MONTO)"),
    ("boton_guardar", "Botón GUARDAR / GRABAR"),
]

print("=" * 60)
print("  MAPEO DE FORMULARIO")
print("  Para cada campo: mueve el mouse y presiona Enter")
print("  Escribe 's' + Enter para saltar un campo")
print("=" * 60)

coordenadas = {}

for nombre, descripcion in CAMPOS:
    print(f"\n  [{len(coordenadas)+1}/{len(CAMPOS)}] {descripcion}")
    print(f"  Nombre: {nombre}")
    resp = input("  >> Mueve el mouse al campo y presiona Enter (o 's' para saltar): ").strip()

    if resp.lower() == 's':
        print(f"  -- Saltado")
        continue

    x, y = pyautogui.position()
    coordenadas[nombre] = (x, y)
    print(f"  [OK] {nombre}: ({x}, {y})")

# Tomar screenshot final
print("\n  Tomando screenshot del formulario...")
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
ss_path = Path("screenshots") / f"formulario_mapeado_{ts}.png"
Path("screenshots").mkdir(exist_ok=True)
pyautogui.screenshot(str(ss_path))
print(f"  [OK] Screenshot: {ss_path.name}")

# Generar código
print("\n" + "=" * 60)
print("  CÓDIGO GENERADO (copiar a get_coordenadas_especificas() en tu Strategy)")
print("=" * 60)
print()
print("return {")
for nombre, coord in coordenadas.items():
    print(f"    '{nombre}': ({coord[0]}, {coord[1]}),")
print("}")

# Guardar JSON también
json_path = Path("data") / f"coordenadas_{ts}.json"
Path("data").mkdir(exist_ok=True)
with open(json_path, "w") as f:
    json.dump(coordenadas, f, indent=2)
print(f"\n  Guardado en: {json_path}")
print(f"  Total campos mapeados: {len(coordenadas)}/{len(CAMPOS)}")
