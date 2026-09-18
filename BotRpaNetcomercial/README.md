# Bot RPA — NetComercial

Automatiza una aplicación de escritorio Windows a través de una sesión de
escritorio remoto, manejando el mouse y el teclado como lo haría una persona.

En este proyecto registra órdenes de compra en NetComercial, tomándolas de la
cola que alimenta la pantalla «Órdenes a girar» de la aplicación web. Pero la
maquinaria no sabe nada de órdenes de compra: sirve igual para cualquier
proceso que haya que automatizar, de entrada o de salida de datos.

📄 **Para entender cómo funciona todo esto**, lee
[ARQUITECTURA_BOT_RPA.md](ARQUITECTURA_BOT_RPA.md) — el documento genérico:
modelo mental, el problema de las coordenadas, cómo escribir tu propio
proceso, y los límites honestos del enfoque.

📄 **Para mapear las pantallas**, sigue [GUIA_MAPEO.md](GUIA_MAPEO.md).

---

## Instalación

```
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env      # y completa APP_USUARIO / APP_PASSWORD
```

El `.env` de la **raíz del proyecto** tiene que tener `BOT_TOKEN`. El bot lo
lee de ahí: hay un solo token, en un solo sitio, para que no pueda quedar
desincronizado con el del backend.

---

## Cómo se usa

### Mapear las pantallas (una vez por proceso)

```
.venv\Scripts\python mapear.py --listar          ver qué falta
.venv\Scripts\python mapear.py oc_cabecera       mapear una pantalla
.venv\Scripts\python mapear.py --instalar        colocar lo descargado
.venv\Scripts\python verificar_coordenadas.py    comprobar, sin hacer clic
```

### Poner el bot a correr

```
INICIAR_BOT.bat                                  el programador, en marcha
.venv\Scripts\python iniciar_runner.py --estado  consultar la cola
.venv\Scripts\python iniciar_runner.py --ahora   correr una vez, ya
```

El backend tiene que estar encendido también (`INICIAR_BACKEND.bat` en la
raíz): el bot le pregunta a él qué hacer y le reporta lo que pasó.

Los horarios se configuran desde la web, en **Administración → Horarios del
bot**. El runner los relee solo cada pocos minutos: cambiar una hora no exige
reiniciar nada.

---

## Qué hay dentro

| Ruta | Qué es |
|---|---|
| `bot_core/core/base_bot.py` | La capa de bajo nivel: RDP, login, clics, capturas, cierre |
| `bot_core/core/bot.py` | El orquestador: reintentos, cortacircuito, control externo |
| `bot_core/core/bot_conectado.py` | El mismo orquestador, reportando a la API |
| `bot_core/core/registry.py` | El registro de estrategias (`@register`) |
| `bot_core/commons/pantalla.py` | DPI awareness y huella de resolución |
| `bot_core/commons/perfiles.py` | Carga de coordenadas, con ancla y guardia de geometría |
| `bot_core/cliente_api.py` | El cliente HTTP contra el backend |
| `bot_core/aviso.py` | El cartel a pantalla completa antes de tomar el control |
| `bot_core/runner.py` | El programador: horarios, candado, ciclo de la corrida |
| `bot_core/scripts/` | **Aquí va tu proceso**, una clase por cada uno |
| `mapear.py` · `verificar_coordenadas.py` | Las herramientas de coordenadas |
| `data/coordenadas/` | Los perfiles mapeados (se versionan) |
| `imagenes/` · `img-validar/` | Anclas y capturas de validación |
| `screenshots/` · `logs/` · `jobs/` | Salidas de ejecución (no se versionan) |

---

## Estado de este proyecto

- ✅ Mapeo de coordenadas, con guardia de geometría y verificación sin clics
- ✅ Cola, horarios y bitácora (SQLite, del lado del backend)
- ✅ API y cliente del worker
- ✅ Programador con aviso previo, candado y vigilancia de latido
- ✅ Botón «Enviar al bot» y pantalla de Administración en la web
- ⏳ **La secuencia de NetComercial**, en
  [`bot_core/scripts/oc_netcomercial.py`](bot_core/scripts/oc_netcomercial.py)

Ese último punto está escrito a partir de una suposición de cómo funciona el
formulario, no de haberlo visto. Por eso el archivo arranca con un cerrojo:

```python
SECUENCIA_CONFIRMADA = False
```

Mientras siga en `False`, la estrategia **se niega a ejecutar**. Es
deliberado: correr una secuencia inventada contra un ERP de producción sin
ambiente de pruebas es exactamente el error que este proyecto no se puede
permitir.

---

## Antes de la primera corrida real

Esto no tiene ambiente de pruebas: el primer clic del bot es un clic en
producción. En orden:

1. Prueba cada sección por separado: `python run.py --modo menu` → `T`.
2. Prueba el flujo completo con **una sola orden**, mirando la pantalla en
   vivo.
3. Recién después, un lote real.

El **FAILSAFE** está activo en las **cuatro esquinas**: mover el mouse a
cualquiera de ellas detiene el bot al instante.
