# Bot RPA sobre escritorio remoto — arquitectura y guía de adopción

Este documento explica cómo funciona el esqueleto completo: qué piezas lo
componen, por qué están separadas así, y qué tienes que hacer tú para
automatizar **tu** proceso encima de él.

No hay nada aquí atado a un dominio concreto. El esqueleto sirve igual para
**meter datos** en una aplicación (registrar documentos, dar de alta
maestros, cargar movimientos) que para **sacarlos** (disparar un reporte,
exportar un listado, leer un saldo). Lo único que cambia de un proceso a
otro son dos cosas: **las coordenadas de tus pantallas** y **la secuencia de
pasos**. Todo lo demás —la cola, los horarios, los reintentos, la bitácora,
las barreras de seguridad— ya está resuelto.

---

## 1. Para qué sirve y para qué no

**Sirve** cuando tienes una aplicación de escritorio Windows —normalmente
un sistema antiguo, a menudo a través de una sesión RDP— que **no tiene API
ni forma soportada de automatizarse**, y hay una tarea repetitiva que una
persona hace a mano decenas de veces al día.

**No sirve** —y usarlo sería un error— cuando la aplicación sí tiene una API,
una base de datos a la que puedas escribir, un importador de archivos, o una
línea de comandos. Automatizar la interfaz es siempre el último recurso: es
lo más frágil que existe, porque depende de que los píxeles sigan donde
estaban. Si hay cualquier otra puerta, entra por ahí.

**El riesgo que hay que aceptar por escrito:** un bot de interfaz **escribe
de verdad** en el sistema de destino, con las credenciales de una persona
real, y ahí queda registrado como si lo hubiera hecho esa persona. Si tu
organización tiene una regla de "solo lectura" sobre ese sistema, esto es
una excepción consciente a esa regla, no un descuido. Conviene que quede
dicho antes de la primera corrida, no después.

---

## 2. El modelo mental: cuatro piezas separadas

```
  ┌─────────────────┐   1. alguien pulsa un botón
  │  Tu aplicación  │──────────────────────────────┐
  │       web       │◄─────────────────────┐       │
  └─────────────────┘   4. mira qué pasó   │       ▼
                                           │   ┌───────────────┐
  ┌─────────────────┐                      │   │   Cola        │
  │  Programador    │  2. llega la hora    └───│   (SQLite)    │
  │  (scheduler)    │──────────────────────────│               │
  └────────┬────────┘                          └───────▲───────┘
           │ 3. arranca el worker                      │
           ▼                                           │ reporta cada paso
  ┌─────────────────────────────────────────┐          │
  │  Worker RPA   → RDP → tu aplicación     │──────────┘
  └─────────────────────────────────────────┘
```

| Pieza | Qué hace | Dónde vive |
|---|---|---|
| **Aplicación web** | Donde una persona decide qué hay que automatizar y lo manda a la cola. Después mira el resultado. | Tu frontend |
| **Cola** | La única fuente de verdad: qué hay pendiente, a qué hora corre, qué pasó. | SQLite, un archivo |
| **Programador** | Vigila los horarios, toma el candado, lanza el worker. | Proceso residente |
| **Worker RPA** | El que de verdad mueve el mouse. Abre el RDP, hace login, ejecuta la secuencia. | Proceso aparte |

**Por qué cuatro procesos y no uno.** Porque el worker es el único que puede
morir de formas raras (la sesión RDP se cae, alguien cierra la ventana, se
va la luz), y cuando muere no debe llevarse la cola con él. Separados, el
trabajo pendiente sobrevive a cualquier accidente del bot y se retoma en la
siguiente corrida.

**El worker nunca abre la base de datos directamente.** Habla con ella a
través de la API de tu backend. Eso mantiene un único dueño de los datos y
te deja mudar el worker a otra máquina el día que quieras, sin cambiar nada
del esquema.

---

## 3. El vocabulario

Seis conceptos. Merece la pena leerlos una vez con calma, porque todo el
resto del sistema está escrito en estos términos.

| Concepto | Qué es |
|---|---|
| **Tarea** | Un proceso automatizable. *"Registrar documentos"*, *"Exportar el reporte diario"*. Cada tarea apunta a una **estrategia**. |
| **Estrategia** | El código que sabe hacer esa tarea: navegar hasta la pantalla y ejecutar la secuencia. Una clase de Python. |
| **Lote** | Un envío: lo que una persona mandó al bot de una sola vez al pulsar el botón. |
| **Unidad** | Lo que el bot procesa de principio a fin sin interrupción. Un documento, un registro, una consulta. Un lote tiene muchas unidades. |
| **Ejecución** | Una corrida del bot, con su hora de inicio, su progreso y su desenlace. |
| **Evento** | Una línea de la bitácora: un paso, con su hora y —si falló— su captura de pantalla. |

La **unidad** es la decisión de diseño más importante que vas a tomar, y
conviene pensarla antes de escribir código. La regla:

> Una unidad es lo más pequeño que puede fallar sin dejar nada a medias.

Si tu proceso registra un documento con 30 líneas de detalle, la unidad es
**el documento entero**, no cada línea: un documento con 12 de sus 30 líneas
es basura que alguien tendrá que ir a limpiar a mano. Si tu proceso exporta
un reporte por sucursal, la unidad es **una sucursal**.

---

## 4. El problema de las coordenadas

Automatizar por interfaz significa hacer clic en un punto de la pantalla. Y
ese punto **se mueve solo**: basta que la sesión remota abra a otra
resolución, que la ventana no quede maximizada igual, o que alguien cambie
la escala de Windows del 100 % al 125 %.

Cuando eso pasa, el bot **no se cae**. Hace clic mal. Y dentro de un sistema
de producción, hacer clic mal es mucho peor que no hacer nada.

El esqueleto ataca esto en **tres capas**, de la más robusta a la más
frágil. Úsalas en este orden:

### Capa 1 — Teclado (la que no se rompe nunca)

Las aplicaciones de escritorio antiguas casi siempre permiten recorrer un
formulario con `Tab` y `Enter`. **Todo campo al que puedas llegar tecleando
no necesita coordenada.** En la práctica esto elimina el 70 % de los puntos
frágiles. Es, de largo, la decisión que más estabilidad te va a dar.

### Capa 2 — Ancla por imagen

Para los campos que sí requieren clic: se guarda un recorte de algo fijo y
con contraste de esa pantalla (el rótulo de una etiqueta, el título de la
ventana) junto con su posición. Al ejecutar, el bot busca ese recorte en
pantalla: si lo encuentra 40 píxeles más abajo porque la ventana apareció
corrida, **corrige todos los campos por igual**. Un ancla por pantalla basta.

### Capa 3 — Coordenada absoluta, con guardia

Como último recurso. Y nunca desnuda: junto a las coordenadas se guarda la
**huella de la pantalla** (resolución y escala) del momento del mapeo. Al
arrancar, el bot la compara con la de ahora, y si no coincide **se niega a
correr** con un mensaje que dice exactamente qué cambió:

```
Las coordenadas no sirven para esta pantalla — resolución: se mapeó en
1920x1080 y ahora la pantalla es 1366x768. El bot se detuvo ANTES de hacer
clic.
```

Eso es todo lo que hace falta pedirle a esta capa: que cuando esté
equivocada, lo sepa.

### Antes de mapear: congela la geometría

1. **Fija la resolución de la sesión remota.** En *Conexión a Escritorio
   Remoto* → *Mostrar opciones* → *Pantalla*, elige una resolución concreta
   (no "Pantalla completa", que cambia según el monitor). Guarda un archivo
   `.rdp` con nombre fijo: el bot abrirá siempre ese.
2. **Escala de Windows al 100 %.** Funciona con otra, pero queda registrada:
   el día que la cambies, el bot se detendrá hasta que vuelvas a mapear.
3. **La aplicación siempre maximizada**, y siempre en el mismo monitor.

> **Detalle técnico que importa:** un proceso Python que no declara ser
> *DPI-aware* recibe coordenadas **lógicas** mientras las capturas llegan en
> píxeles **físicos**. Con la escala al 125 % eso desplaza cada clic un 20 %.
> El esqueleto declara el DPI awareness antes de tocar nada, en todos los
> procesos. Si extiendes el código con un script propio que mire la
> pantalla, llama tú también a `activar_dpi_awareness()` **antes** de
> importar la librería de automatización.

---

## 5. Cómo se mapea una pantalla

Dos herramientas, y ninguna de las dos hace clic en nada.

### `mapear.py` — capturar los puntos

```
python mapear.py --listar          ver el catálogo de pantallas
python mapear.py mi_pantalla       mapear una
python mapear.py --instalar        colocar lo descargado en su sitio
```

Te da unos segundos para pasar a la pantalla que quieres mapear, toma una
captura, y **abre una página en tu navegador**. Ahí:

1. **Marca el ancla primero**: arrastra un recuadro sobre algo fijo.
2. **Elige un campo de la lista y haz clic sobre la captura.** Al soltar
   salta solo al siguiente: se mapea en cadena.
   - La **lupa** amplía ×8 para acertar al píxel.
   - Las **flechas del teclado** corrigen el último punto puesto.
3. Borra los campos que no existan en tu pantalla y agrega los que falten
   —la lista que viene es una suposición, no una verdad.
4. **Guardar perfil** descarga el JSON y el recorte del ancla.

> **Por qué sobre una captura y no en vivo.** El píxel que eliges en la
> captura es exactamente el píxel de la pantalla (se toma a resolución
> nativa, con DPI awareness). Pero además puedes acercarte, corregir y
> rehacer cuantas veces quieras **sin tocar la aplicación ni una sola vez**.
> Las herramientas que capturan la posición del mouse en vivo obligan a
> alternar entre la consola y la ventana remota, y ese alt-tab constante es
> justo lo que arruina el mapeo dentro de un RDP.

### `verificar_coordenadas.py` — comprobar sin arriesgar

**Este paso no es opcional.** Un sistema de producción no tiene ambiente de
pruebas: el primer clic del bot es un clic real.

```
python verificar_coordenadas.py                    anota todos los perfiles
python verificar_coordenadas.py mi_pantalla --mover   pasea el mouse por los puntos
```

- Sin argumentos, toma una captura nueva y **dibuja encima cada punto con su
  nombre**. Sale un PNG que puedes revisar con calma o mandar por correo. No
  mueve el mouse.
- Con `--mover`, lleva el mouse punto por punto anunciando cuál es, para que
  veas en vivo que cada campo se resalta. **Nunca pulsa el botón.**

### Qué queda guardado

```
data/coordenadas/mi_pantalla.json      el perfil (esto SÍ va a git)
imagenes/anclas/ancla_mi_pantalla.png  el recorte del ancla (también)
data/mapeo/mi_pantalla_<fecha>.png     la captura completa (esto NO va a git)
```

La distinción importa: el perfil y el ancla son **configuración sin la que
el bot no arranca**, y mapear cuesta media hora de trabajo manual — se
versionan. Las capturas de pantalla completas son fotos de un sistema real,
con datos reales dentro — se quedan fuera.

---

## 6. Cómo automatizar tu proceso

Cada proceso es una clase. No se toca el orquestador, no se toca nada más.

```python
from bot_core.core.strategy_base import RegistroStrategy
from bot_core.core.registry import register
from bot_core.commons import perfiles


@register(code="2", name="Mi proceso")
class MiProcesoStrategy(RegistroStrategy):

    def get_nombre(self) -> str:
        return "Mi proceso"

    def get_coordenadas_especificas(self) -> dict:
        # Las coordenadas salen del perfil mapeado, no escritas a mano.
        return perfiles.cargar("mi_pantalla").como_diccionario()

    def navegar_hasta_modulo(self, bot) -> bool:
        """Del menú principal hasta la pantalla donde se trabaja."""
        bot.click_coordenada("menu_principal")
        bot.click_coordenada("submenu_mi_modulo")
        return bot.esperar_hasta_imagen("mi_pantalla_lista", timeout=20)

    def registrar_registro(self, bot, data: dict) -> bool:
        """UNA unidad de trabajo, de principio a fin."""
        bot.click_coordenada("boton_nuevo")

        # La mayoría de campos avanzan solos: no gastes coordenadas en ellos.
        bot.pegar_texto(data["campo_a"]);  pyautogui.press("enter")
        bot.pegar_texto(data["campo_b"]);  pyautogui.press("enter")

        # Solo los que de verdad lo necesitan llevan clic.
        bot.click_coordenada("campo_que_no_alcanza_el_tab")
        bot.pegar_texto(data["campo_c"])

        bot.click_coordenada("boton_grabar")
        return True

    def verificar_registro(self, bot, data: dict) -> bool:
        """No confíes en que grabar funcionó: compruébalo."""
        return self.validar_pantalla("confirmacion_guardado.png")

    def limpiar_formulario(self, bot) -> bool:
        """Dejar la pantalla lista para la siguiente unidad."""
        bot.click_coordenada("boton_nuevo")
        return True
```

Registrar la clase con `@register` es todo: aparece sola en el menú y en la
lista de tareas disponibles. El orquestador se encarga del resto.

### Tres trucos que vas a necesitar

**`bot.pegar_texto()` en vez de escribir carácter a carácter.** Escribir con
`pyautogui.write()` funciona para texto corto y simple, pero en sesiones
remotas falla con texto largo, con tildes, y a veces la combinación
`Ctrl+V` llega partida (la sesión recibe solo la `V`). `pegar_texto()` fija
el portapapeles por dos vías distintas, verifica que quedó bien puesto, y
pega con pulsaciones explícitas. Úsalo para cualquier campo de texto real.

**Doble clic para reemplazar.** Si un campo ya trae contenido, escribir
encima lo concatena. Un doble clic selecciona todo antes de escribir. Anota
esto como nota del campo al mapearlo — el perfil guarda una nota por campo
justo para esto.

**Comprueba que grabó, no lo supongas.** El caso que te va a morder es el
cuadro de diálogo inesperado: el bot pulsa Grabar, sale un aviso que no
esperabas, el bot sigue adelante como si nada y las siguientes 20 unidades
se escriben sobre un formulario que ya no es el que cree. Por eso existe
`verificar_registro()`, y por eso existe el cortacircuito de la sección 9.

---

## 7. Los dos sentidos: meter datos y sacar datos

El esqueleto no distingue. Lo que cambia es qué guarda cada unidad.

### Meter datos

La unidad lleva el contenido a escribir. El campo `resultado` recoge lo que
el sistema devuelve (un número de documento, un código generado):

```json
{
  "clave": "DOC-2026-0155",
  "etiqueta": "Documento de la sucursal norte",
  "detalles": [ {"codigo": "A1", "cantidad": 10}, {"codigo": "B2", "cantidad": 4} ],
  "valor": 1250.50
}
```

### Sacar datos

La unidad lleva los **parámetros de la consulta**, y no tiene ni detalles ni
valor. El `resultado` recoge lo extraído o la ruta del archivo generado:

```json
{
  "clave": "reporte-ventas-2026-09",
  "etiqueta": "Ventas de setiembre",
  "consulta": { "desde": "2026-09-01", "hasta": "2026-09-30" }
}
```

**Cómo sacar el dato de la pantalla**, de mejor a peor:

1. **Que la aplicación exporte un archivo.** Si tiene un botón de
   *Exportar a Excel*, úsalo: el bot pulsa el botón, espera el archivo y lo
   lee. El dato llega exacto, sin interpretación de por medio.
2. **Copiar al portapapeles.** Seleccionar y `Ctrl+C`, luego leer el
   portapapeles. Exacto también, cuando la aplicación lo permite.
3. **Leer la pantalla con OCR.** Solo como último recurso, y nunca para
   números que importen: un OCR que confunde un `8` con un `3` no avisa de
   que se equivocó. Si no te queda otra, valida el resultado contra algo
   (un total que deba cuadrar, un formato esperado) antes de darlo por
   bueno. Las dependencias de OCR van aparte, en
   `requirements-opcional.txt`, precisamente para que instalarlas sea una
   decisión y no un descuido.

---

## 8. Horarios y el candado del mouse

### Solo un bot a la vez, siempre

Hay un solo mouse y un solo teclado en la máquina. Dos bots simultáneos no
se estorbarían: se destrozarían el trabajo mutuamente dentro de la
aplicación. Por eso hay un **candado global**: mientras haya una ejecución
viva, cualquier otra que toque su hora **espera en la cola** en vez de
arrancar.

Esto no limita cuántos procesos distintos puedes automatizar — puedes tener
cinco tareas con horarios propios. Solo garantiza que se turnan.

### Varias tareas, varios horarios

Cada tarea puede tener varios horarios, y cada horario define:

- **la hora** (`HH:MM`) y **los días** de la semana,
- **el aviso previo** en segundos,
- **un tope de unidades por corrida**, para que una corrida nocturna no se
  convierta en una sesión de seis horas sin vigilancia.

### El aviso previo, y por qué existe

Cuando el bot arranca **se adueña del mouse y del teclado de la máquina**.
Cualquier clic de una persona en ese momento cae dentro del formulario que
el bot está llenando.

Por eso, antes de tomar el control, muestra un aviso a pantalla completa con
cuenta regresiva y un botón de **posponer**. Si nadie responde, arranca. Si
alguien pospone, se corre unos minutos y vuelve a preguntar.

Tres formas de convivir con esto, de menos a más cómoda:

1. **Fuera del horario de trabajo.** Ventanas a primera hora, al mediodía,
   al final del día. Lo más simple y lo más seguro.
2. **A cualquier hora con aviso.** Cómodo, y con el botón de posponer nunca
   te atropella. Es la opción por defecto del esqueleto.
3. **Una máquina dedicada.** Un equipo o una máquina virtual que nadie usa.
   La solución limpia: sin horarios restringidos y sin riesgo de choque.
   Requiere conseguir el equipo.

> **Atención:** la pantalla tiene que estar **desbloqueada**. Si Windows
> bloquea la sesión, la búsqueda por imagen deja de ver nada y el bot falla
> en seco. Cualquier planificación tiene que contar con eso.

### Cómo se pone en marcha

El programador es un proceso residente. Mientras esté vivo, respeta los
horarios; cuando no, el bot solo corre si alguien lo lanza a mano:

```
python iniciar_runner.py            queda escuchando los horarios
python iniciar_runner.py --ahora    corre una vez y sale
python iniciar_runner.py --estado   consulta la cola sin tocar nada
```

Tres cosas que el programador garantiza y conviene conocer:

- **Si llega la hora y ya hay una corrida en marcha, el disparo se omite.**
  No se encola un segundo bot: el trabajo se queda donde estaba y lo toma la
  corrida siguiente.
- **Si la máquina estaba dormida**, un disparo perdido todavía sirve hasta
  diez minutos tarde; pasado eso se descarta en vez de arrancar a deshora.
  Y varios disparos perdidos se funden en uno solo.
- **Al cerrar el proceso, una corrida en marcha se deja terminar.** Matarla a
  medias dejaría un documento a medio llenar dentro de la aplicación.

---

## 9. Qué se registra cuando algo falla

Esta es la parte que decide si el sistema es mantenible o es una caja negra
que nadie se atreve a tocar.

**Cada paso deja un evento** en la bitácora, con su hora, su nivel
(`info` / `aviso` / `error`), el paso exacto (`"llenando el campo precio,
detalle 3 de 12"`) y a qué unidad pertenecía.

**Ante cualquier fallo se toma una captura de pantalla automáticamente** y
se enlaza al evento. En la pantalla de administración abres la ejecución
fallida y ves la secuencia completa con la foto del momento exacto en que se
rompió. No hay que reproducir nada ni adivinar: está la imagen.

**Tres mecanismos de contención**, que conviene entender juntos:

| Mecanismo | Qué hace | Por qué |
|---|---|---|
| **Reintento** | Reintenta la misma unidad un par de veces, volviendo a navegar desde el menú entre intentos. | Los fallos transitorios (la sesión remota tardó de más) se resuelven solos. |
| **Cortacircuito** | Si fallan N unidades seguidas, **aborta la corrida entera**. | N fallos seguidos no son mala suerte: es una pantalla bloqueada o un diálogo que nadie cerró. Seguir insistiendo solo multiplica el daño. |
| **Vigilancia de latido** | Una corrida que deja de dar señales de vida se da por abortada y **libera el candado**. | Si el bot muere en seco, sin esto el candado quedaría tomado para siempre y ninguna corrida futura podría arrancar. |

**Control en vivo desde la web:** mientras una corrida está en marcha se le
puede mandar **pausar**, **reanudar**, **saltar** la unidad actual o
**detener** todo. El bot revisa las órdenes pendientes entre unidad y unidad.

---

## 10. Las barreras de seguridad, juntas

Vale la pena tenerlas en una sola lista, porque son la diferencia entre un
bot que da confianza y uno que da miedo:

| Barrera | Contra qué protege |
|---|---|
| **FAILSAFE en las cuatro esquinas** | Mover el mouse a cualquier esquina detiene el bot al instante. Es el freno de mano, y funciona siempre. |
| **Guardia de geometría** | Si la resolución o la escala cambiaron, el bot **no arranca**. Nunca hace clic a ciegas. |
| **Campo no mapeado** | Pedir una coordenada que no existe lanza un error con la lista de las que sí. Un error de tipeo no se convierte en un clic en la esquina de la pantalla. |
| **Clave en vuelo** | Mandar dos veces la misma unidad mientras la primera sigue pendiente se rechaza. Sin esto, un doble clic en el botón duplica el trabajo en el sistema de destino — y eso no se deshace desde aquí. |
| **Payload congelado** | Lo que se guarda es lo que la persona vio y aprobó al pulsar el botón, no una referencia que se recalcularía cuando al bot le toque el turno tres horas después. |
| **Cortacircuito** | N fallos seguidos abortan la corrida. |
| **Tope por corrida** | Un límite de unidades por ejecución, para que nada se desmande sin vigilancia. |
| **Nada se pierde al cortarse** | Al cerrar una corrida, lo que quedó a medio procesar vuelve a «pendiente». Una corrida que se rompe no se lleva el trabajo con ella: lo retoma la siguiente. |
| **Cerrojo de secuencia** | Una estrategia cuya secuencia no se ha verificado contra la pantalla real se niega a ejecutar. Correr una secuencia supuesta contra producción es el error que este enfoque no se puede permitir. |

Y una que no es código: **prueba cada sección por separado antes del flujo
completo.** El esqueleto trae un modo de prueba por secciones (conexión,
login, navegar, ejecutar una sola unidad). Úsalo. Luego una corrida completa
con **una sola unidad**, mirando la pantalla en vivo. Recién después, un
lote real.

---

## 11. El esquema de datos

SQLite, un archivo. Un solo proceso escribe a la vez, así que no le debe
nada a un motor más grande — y evita un servicio más que puede no arrancar
justo la mañana en que hacía falta. Se abre en modo WAL para que la web
pueda leer mientras el bot escribe.

| Tabla | Qué guarda |
|---|---|
| `tarea` | Los procesos automatizables y a qué estrategia apunta cada uno. |
| `horario` | Cuándo se dispara cada tarea: hora, días, aviso previo, tope por corrida. |
| `lote` | Un envío: quién lo mandó, cuándo, y con qué parámetros. |
| `item` | Una unidad de trabajo: `clave`, `etiqueta`, `payload` congelado, estado, intentos, `resultado`. |
| `ejecucion` | Una corrida: estado, progreso, conteos, inicio, fin, `latido`. |
| `evento` | La bitácora: nivel, paso, mensaje, captura, traza. |
| `control` | Órdenes en vivo para un bot en marcha (pausar, saltar, detener). |

Los nombres de `item` son deliberadamente neutros:

- **`clave`** — el identificador único de la unidad **dentro de tu proceso**.
  Es lo que impide duplicados.
- **`etiqueta`** — el nombre legible, el que ve una persona en pantalla.
- **`valor`** — una magnitud opcional para ordenar la cola. Las unidades de
  mayor valor se procesan primero, de modo que si una corrida se corta a
  medias, lo que quedó hecho es lo que más pesaba. Si tu proceso no tiene
  ninguna magnitud, déjalo en cero y la cola será por orden de llegada.
- **`payload`** — el JSON entero de la unidad, congelado. Tu estrategia lee
  de aquí y puede tener la forma que necesite.
- **`resultado`** — lo que el proceso devolvió: un número de documento, una
  ruta de archivo, un dato extraído.

Lo único específico de un proyecto es la lista de **tareas de fábrica**
(`TAREAS_INICIALES`): ahí declaras tus procesos. Todo lo demás es genérico.

---

## 12. La API

El worker nunca abre la base directamente. Dos grupos de endpoints:

**Para la aplicación web** — encolar trabajo y mirar qué pasó:

```
POST  /api/bot/encolar                    mandar unidades a la cola
GET   /api/bot/estado                     resumen: pendientes, corrida viva
GET   /api/bot/lotes                      historial de envíos
POST  /api/bot/lote/{id}/cancelar         cancelar lo que aún no se ejecutó
POST  /api/bot/item/{id}/reintentar       reencolar una unidad fallida
GET   /api/bot/ejecuciones                historial de corridas
GET   /api/bot/ejecucion/{id}/eventos     la bitácora, con sus capturas
POST  /api/bot/ejecucion/{id}/control     pausar / reanudar / saltar / detener
GET   /api/bot/horarios                   y su alta, edición y baja
```

**Para el worker** — protegidos por un token compartido:

```
POST  /api/bot/runner/reclamar            tomar el candado y recibir trabajo
POST  /api/bot/runner/ejecucion/{id}/progreso
POST  /api/bot/runner/ejecucion/{id}/evento
POST  /api/bot/runner/item/{id}/resultado
GET   /api/bot/runner/ejecucion/{id}/control
POST  /api/bot/runner/ejecucion/{id}/finalizar
```

El token vive en el `.env`, nunca en el código.

---

## 13. Checklist para adoptar esto en un proyecto nuevo

**Preparación** (una vez)

- [ ] Confirmar que **no hay** una API, base de datos o importador que evite
      tener que automatizar la interfaz. Si lo hay, para aquí y úsalo.
- [ ] Dejar por escrito que el bot escribirá en el sistema de destino con
      las credenciales de una persona real.
- [ ] Congelar la geometría: resolución fija del RDP, escala al 100 %,
      aplicación maximizada.
- [ ] Crear el entorno virtual e instalar las dependencias.
- [ ] Definir el token del worker en el `.env`.

**Por cada proceso que automatices**

- [ ] Decidir cuál es tu **unidad de trabajo** (lo más pequeño que puede
      fallar sin dejar nada a medias).
- [ ] **Escribir la secuencia a mano, anotando cada paso**: qué menú, qué
      campos, en qué orden, cuáles avanzan con `Enter`, cuáles necesitan
      clic, cuáles traen contenido previo que hay que reemplazar, qué sale
      al grabar, y qué mensaje aparece en cada caso de error. *Esto es el
      verdadero cuello de botella, más que las coordenadas.* Si te resulta
      más fácil, grábate en video haciéndolo una vez.
- [ ] Mapear las pantallas con `mapear.py`, marcando el ancla en cada una.
- [ ] Verificar con `verificar_coordenadas.py` antes de tocar nada.
- [ ] Escribir la estrategia, minimizando los clics por coordenada.
- [ ] Recortar las imágenes de validación que confirman que cada paso salió
      bien.
- [ ] Declarar la tarea y sus horarios.
- [ ] Probar sección por sección → una unidad mirando en vivo → un lote real.

---

## 14. Lo que este enfoque no resuelve

Conviene decirlo, para que nadie se lleve una sorpresa a los seis meses:

- **Si la aplicación cambia de aspecto, hay que volver a mapear.** Una
  actualización que mueva un campo tres píxeles rompe ese campo. El ancla
  absorbe los desplazamientos de la ventana entera, no el rediseño de un
  formulario.
- **Es lento.** Un bot de interfaz va al ritmo de la interfaz: segundos por
  campo, no milisegundos. Para volúmenes grandes de verdad, esto no es la
  herramienta.
- **Necesita una sesión gráfica desbloqueada.** No se puede ejecutar como un
  servicio de Windows en segundo plano.
- **No hay ambiente de pruebas.** Cada corrida escribe en producción. Todas
  las barreras de la sección 10 existen por esto, y ninguna sustituye a
  mirar la primera corrida con los ojos.
