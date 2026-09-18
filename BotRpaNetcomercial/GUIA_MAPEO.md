# Cómo sacar las coordenadas de NetComercial

Esta es la Fase 1: lo único que hace falta de tu parte para que el bot pueda
empezar a moverse. Son unos 40 minutos de trabajo, una sola vez.

---

## Antes de empezar: congela la geometría

Las coordenadas son píxeles de la pantalla. Si mañana el RDP abre a otro
tamaño, los 30 puntos que mapeaste apuntan a otro sitio, y el bot no se cae:
hace clic mal dentro de producción. Por eso, primero:

**1. Fija la resolución del RDP.**
En *Conexión a Escritorio Remoto* → **Mostrar opciones** → pestaña
**Pantalla** → elige una resolución concreta (no "Pantalla completa"). Luego
pestaña **General** → **Guardar como…** y deja el `.rdp` en el escritorio con
un nombre fijo. El bot abrirá siempre ese archivo.

**2. Escala de Windows al 100%.**
*Configuración → Sistema → Pantalla → Escala*. Si está en 125% o 150%,
funciona igual, pero queda registrado: el día que la cambies, el bot se
negará a arrancar hasta que vuelvas a mapear.

**3. NetComercial siempre maximizado.** Y no muevas la ventana entre
pantallas si tienes dos monitores.

> Si algo de esto cambia después, el bot **no** hace clic a ciegas: compara
> la geometría al arrancar y se detiene con un mensaje diciendo exactamente
> qué cambió.

---

## Paso 1 — Mapear cada pantalla

Desde esta carpeta:

```
.venv\Scripts\python mapear.py --listar
```

Te muestra el catálogo de pantallas y cuáles faltan. Van en el mismo orden
en que aparecen al trabajar, que es también el orden en que conviene
mapearlas:

| # | Pantalla | En qué estado tiene que estar NetComercial |
|---|---|---|
| 1 | `escritorio_rdp` | El escritorio remoto, con NetComercial **cerrado** |
| 2 | `login` | El cuadro «Bienvenidos al Sistema», con los datos escritos |
| 3 | `seleccion_empresa` | El cuadro «SELECCION DE EMPRESAS» abierto |
| 4 | `seleccion_almacen` | El cuadro «SELECCION DE ALMACENES» abierto |
| 5 | `menu_ordenes_compra` | El menú «Compras / O.Compra» **desplegado** |
| 6 | `oc_cabecera` | El formulario «Orden de Compra» abierto |
| 7 | `oc_detalle` | El mismo formulario, pestaña «Detalle», con al menos una línea |
| 8 | `oc_cierre` | El mismo formulario (la barra de botones de abajo) |

Las pantallas 6, 7 y 8 son **el mismo formulario**: se mapean por separado
solo para no tener que acertar cuarenta puntos de una sentada. Puedes hacer
las tres seguidas sin cerrar nada.

Para cada una:

```
.venv\Scripts\python mapear.py oc_cabecera
```

Te da 10 segundos para pasar a esa pantalla dentro del RDP, toma una captura
y **abre una página en tu navegador**.

> **Por qué la cuenta regresiva y no un botón:** durante esos 10 segundos no
> tienes que tocar nada más que NetComercial. Eso es lo que permite mapear
> un **menú desplegado**: lo abres, no tocas nada, y la captura se dispara
> sola con el menú todavía abierto. Si hubiera que volver a la consola a
> pulsar algo, el menú se cerraría al perder el foco.

En la página:

1. **Marca el ancla primero.** Pulsa *Marcar ancla* y arrastra un recuadro
   sobre algo fijo y con contraste de esa pantalla — el rótulo `PROVEEDOR:`,
   el título de la ventana, una etiqueta. Es lo que permite que el bot se
   reubique solo si la ventana aparece unos píxeles corrida.
2. **Elige un campo** de la lista de la izquierda y **haz clic sobre la
   captura**, en el centro del campo. Al soltar salta solo al siguiente: se
   mapea en cadena, sin volver a la lista.
   - La **lupa** de abajo a la derecha amplía ×8 para acertar al píxel.
   - Las **flechas del teclado** corrigen el último punto (con Shift, de 10
     en 10).
3. **Los campos del catálogo son una suposición mía**, no una verdad.
   Borra con la `×` los que no existan en tu pantalla, y agrega los que
   falten escribiendo el nombre abajo y pulsando `+`.
4. Pulsa **Guardar perfil**. Descarga dos archivos: el JSON y el recorte del
   ancla.

Cuando termines todas las pantallas:

```
.venv\Scripts\python mapear.py --instalar
```

Busca lo descargado en tu carpeta de Descargas y lo coloca en su sitio
(`data/coordenadas/` y `imagenes/anclas/`). Si ya había un perfil de esa
pantalla, lo respalda antes de reemplazarlo.

---

## Paso 2 — Verificar sin tocar nada

**Esto no es opcional.** NetComercial no tiene ambiente de pruebas: el primer
clic del bot es un clic en producción.

```
.venv\Scripts\python verificar_coordenadas.py
```

Toma una captura nueva y dibuja encima cada punto con su nombre. Sale un PNG
en `data/verificacion/` que puedes revisar con calma. **No mueve el mouse ni
hace ningún clic.**

Y en vivo, para ver que cada campo se resalta al pasar por encima:

```
.venv\Scripts\python verificar_coordenadas.py oc_cabecera --mover
```

Lleva el mouse punto por punto, anunciando cuál es. **Nunca pulsa el botón.**
Si algo va mal, mueve el mouse a cualquier esquina de la pantalla y se
detiene en seco.

---

## Paso 3 — Lo que tienes que contarme

Las coordenadas solas no bastan. Lo que de verdad no puedo deducir es **la
secuencia**: qué hace un humano, en qué orden, para registrar una OC.

Mándame los perfiles (`data/coordenadas/*.json`), los PNG de verificación, y
respóndeme esto:

**Navegación**
- ¿Por qué menú se llega al registro de órdenes de compra?
- ¿Hay que elegir algo antes (empresa, almacén, tipo de documento)?

**Cabecera**
- ¿El proveedor se escribe por código, por RUC o se busca en una lista?
- ¿Qué pasa al escribirlo: se completan solos los demás campos?
- ¿Qué campos hay que llenar sí o sí y cuáles vienen con valor por defecto?

**Detalle**
- ¿Cómo se agrega la primera línea? ¿Y las siguientes: con un botón, con
  Enter al final de la fila, con la flecha abajo?
- Por cada línea: ¿en qué orden se llenan código, cantidad y precio?
- ¿Qué campos avanzan solos con Enter y cuáles necesitan clic?
- ¿Algún campo trae contenido previo que haya que reemplazar (esos van con
  doble clic para seleccionar todo antes de escribir)?

**Cierre**
- ¿Cómo se graba? ¿Sale un cuadro de confirmación? ¿Qué dice y qué botón se
  pulsa?
- ¿Dónde queda el número de OC ya grabada? (lo quiero guardar para poder
  enlazar cada orden del plan con su OC real)

**Cuando algo sale mal**
- ¿Qué mensaje sale si el proveedor no existe?
- ¿Y si un código no le corresponde a ese proveedor?
- ¿Y si el precio se sale de algún límite?

> Si te resulta más fácil, **graba un video** registrando una OC de principio
> a fin, narrando lo que haces. De ahí saco todo esto.

---

## Recordatorio de seguridad

- El **FAILSAFE** está activo en las **cuatro esquinas**: mover el mouse a
  cualquiera de ellas detiene el bot al instante.
- Ningún script de esta fase hace clic. `mapear.py` solo captura la pantalla;
  `verificar_coordenadas.py` como mucho mueve el mouse.
- Las capturas de pantalla completas **no se suben a git** (llevan nombres de
  proveedores y precios dentro). Los perfiles de coordenadas y los recortes
  del ancla sí, porque son configuración sin la que el bot no arranca.
