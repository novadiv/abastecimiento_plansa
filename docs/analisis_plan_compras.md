# Plan de Compras — SUMINISTROS, REPUESTOS y EMBALAJES

**Fecha de análisis:** 2026-09-11
**Fuente de datos:** MongoDB `Bot_logistic_net_1387420665501454419` (colecciones `productos_maestro`, `requerimientos_almacen`, `ordenes_compra`, `proveedores`)
**Entregable:** `Plan_Compras_Suministros_Repuestos_Embalajes.xlsx` (raíz del proyecto)

---

## 1. Alcance y colecciones usadas

| Colección | Rol en el análisis |
|---|---|
| `productos_maestro` (26,127 docs; 10,283 en las 3 familias) | Maestro de productos. Ya trae un motor de forecasting/replenishment corriendo en producción: `patron_consumo`, `compra_sugerida`, `criticidad`, `segmento_abc`, `confidence_level`, `prom_12m`, `p95_12m`, precios, proveedor de última compra, lead time, etc. |
| `requerimientos_almacen` (176,831 docs; 71,367 en las 3 familias) | Requerimientos de almacén, con `glosa_detalle_requerimiento` (texto libre) y `nro_oc` (OC asociada). Usada para disgregar códigos genéricos. |
| `ordenes_compra` (47,765 docs) | Órdenes de compra línea por línea (proveedor, precio, cantidad, moneda). Usada para validar la asociación requerimiento↔OC. |
| `proveedores` (1,080 docs) | Confirma que el sistema ya aplica una cobertura variable por producto (campo `alertas_compra[].cobertura_meses`, entre 1.5 y 12 meses según `confidence_level`). |

**Familias objetivo** (nombre exacto en la base): `SUMINISTROS`, `REPUESTOS`, `EMPAQUES y EMBALAJES` (el usuario se refería a esta última como "EMBALAJES").

No existe una colección de inventario/stock separada: `stock_actual` ya vive dentro de `productos_maestro`.

---

## 2. Decisión clave: no reinventar el forecast, sí resolver sus dos puntos ciegos

`productos_maestro.compra_sugerida` ya es un cálculo neto de reposición (descuenta stock actual, on-order, aplica stock de seguridad estacional). Replicar esa lógica desde cero habría sido redundante y arriesgado (podría contradecir un número que el negocio ya usa). Por eso el plan:

- **Usa `compra_sugerida` como cantidad base** por código.
- Agrega dos capas que el maestro **no** resuelve:
  1. **Cobertura objetivo explícita y escalonada por patrón de consumo** (sección 3).
  2. **Disgregación de códigos genéricos por talla/color** usando la glosa de requerimientos con OC asociada (sección 4).
- Suma contexto de compra (proveedor, precio, lead time, criticidad) para que el Excel sea accionable sin cruzar más tablas.

---

## 3. Cobertura de compra: de "2 meses fijos" a cobertura escalonada por patrón

Se validó la propuesta original del usuario (2 meses) contra los datos reales. Al calcular la cobertura que el propio sistema ya está aplicando (`compra_sugerida / prom_12m`) para las 3 familias:

| Patrón de consumo | N° códigos con compra sugerida | Cobertura implícita actual (mediana) | Cobertura objetivo recomendada |
|---|---|---|---|
| RECURRENTE | 93 | 1.76 meses | **2 meses** |
| SEMI_RECURRENTE | 113 | 2.62 meses | **3 meses** |
| INTERMITENTE | 199 | 4.36 meses | **4.5 meses** |
| ESPORADICO | 1,490 | 11.98 meses | **12 meses** |

**Conclusión:** 2 meses es razonable solo para el bucket RECURRENTE. Aplicarlo a todo el universo subestimaría sistemáticamente la compra de los productos INTERMITENTE/ESPORÁDICO, generando exactamente el problema que se quiere evitar: más pedidos pequeños y más carga operativa. La cobertura escalonada (2 / 3 / 4.5 / 12 meses) **no es una invención**: formaliza y hace explícito el patrón que ya existe de facto en `compra_sugerida` y en `proveedores.alertas_compra[].cobertura_meses` (rango observado: 1.5–12 meses, correlacionado con `confidence_level`).

Esto responde directamente al pedido del usuario de "sugerir una cobertura diferente si los datos lo justifican": los datos muestran que la cola larga esporádica debe comprarse en lotes que cubran ~12 meses (pocas órdenes grandes) en vez de replenishment frecuente, precisamente para reducir la carga operativa que el usuario señaló.

El Excel incluye la columna `cobertura_implicita_meses` (la que ya resulta de `compra_sugerida`) junto a `cobertura_objetivo_meses` (la recomendada), para que el comprador identifique visualmente los códigos donde ambas divergen mucho.

---

## 4. Cola larga (ESPORADICO): sí se incluye, y pesa más de lo esperado

Dentro de las 3 familias, la clasificación de `patron_consumo` (ya calculada por el sistema a partir del historial real) da:

| Patrón | N° códigos en plan | Valor sugerido (PEN) | % del valor total del plan |
|---|---|---|---|
| RECURRENTE | 185 | 93,586 | 17.4% |
| SEMI_RECURRENTE | 237 | 56,345 | 10.5% |
| INTERMITENTE | 338 | 60,526 | 11.2% |
| **ESPORADICO** | **2,564** | **328,659** | **61.0%** |

**Hallazgo importante:** la cola larga esporádica no es solo "poco volumen, mucha carga operativa" (como intuía el usuario) — en este dataset también concentra **el 61% del valor total sugerido de compra** y el **77% de los ítems**. Excluirla del plan (como suele pasar cuando el foco es solo en los recurrentes) dejaría fuera la mayor parte del presupuesto real de compras de estas 3 familias. Se incluye íntegra en el plan, en su propia hoja ("Cola Larga - Esporadicos") y con la recomendación operativa de **consolidar en pocas órdenes de compra grandes por proveedor/área**, en vez de una OC reactiva por cada requerimiento.

Se excluyen del plan únicamente los códigos con `patron_consumo = SIN_CONSUMO` o sin patrón calculable (7,020 de 10,283 códigos de las 3 familias — mayormente ítems descontinuados o sin movimiento en la ventana analizada). Quedan listados, no borrados, en la hoja "Sin Actividad" para trazabilidad.

---

## 5. Códigos genéricos: el problema de las tallas/colores agrupados

### 5.1 Validación del problema

Se confirmó exactamente el patrón que describió el usuario. Ejemplo real: el código `10005123` ("ZAPATO DE SEGURIDAD INDUSTRIAL") acumula 153 requerimientos con OC y glosa, con `glosa_detalle_requerimiento` conteniendo texto como `"talla 36"`, `"t42"`, `"TALLA 39"` — información de talla que **no existe en ningún campo estructurado**, solo en ese texto libre, y solo es fiable cuando el requerimiento tiene una OC real asociada (`nro_oc` no nulo) — se validó esta condición explícitamente antes de usar la glosa.

De 71,367 requerimientos en las 3 familias, solo el **12.4%** tiene `nro_oc` asociada y el **7.3%** tiene glosa de detalle no vacía. La intersección (glosa + OC, la única combinación confiable) da **4,394 requerimientos**, suficiente para hacer inferencia estadística en los códigos con volumen.

### 5.2 Dos tipos de "código genérico", tratamiento distinto

Al analizar la glosa de todos los códigos candidatos, aparecieron **dos poblaciones muy distintas** que requieren tratamiento diferente (mejora sobre el planteamiento original, que asumía un solo patrón tipo "zapato-talla"):

**A. Variante acotada y recurrente (talla/color)** — típico de EPP/SSOMA: zapatos, guantes, cascos, pintura. El conjunto de valores posibles es pequeño y se repite (tallas 35-46, S/M/L/XL, colores). → **Se disgregan.**

**B. Especificación libre por pedido** — típico de REPUESTOS mecánicos: O-rings, rodamientos, retenes, mangueras, resortes, adaptadores hidráulicos, tubos. Cada pedido trae una medida/plano distinto (ej. `"RADIAL 40X50X3.5"`, `"6208 2RS/C3"`), casi nunca se repite exactamente. → **No se disgregan** (forzarlo crearía miles de pseudo-SKUs de una sola compra, sin valor de planificación). Se listan aparte con su frecuencia histórica, para que compras anticipe la carga operativa y sepa que debe revisar la glosa/plano en cada requerimiento.

Regla de decisión aplicada: para cada código candidato (≥5 requerimientos con OC+glosa, excluyendo códigos que ya tienen la talla en su propio nombre — 74 códigos, ej. "ZAPATO SEGURIDAD IND. T:40") se midió qué % de sus glosas matchea un patrón de talla (`talla NN`, `tNN`, `TALLA M/L/XL`) o de color (lista de 13 colores). Si ≥40% de las glosas matchean **y** hay ≥2 variantes distintas → grupo A (disgregable). Si no, y las glosas son mayormente únicas (≥60% distintas) → grupo B (spec variable).

**Resultado:**
- **18 códigos genéricos disgregables** (grupo A) — mayormente guantes, zapatos, cascos y pinturas.
- **135 códigos de especificación variable** (grupo B) — mayormente repuestos mecánicos.

### 5.3 Cómo se reparte la cantidad sugerida

Para cada código del grupo A, se calculó qué % histórico de la demanda corresponde a cada variante (talla/color), y se aplicó ese % a la `compra_sugerida` del código madre — así la cantidad total sugerida no cambia respecto al maestro, solo se reparte de forma accionable por talla/color. Se agregó una columna `confianza_disgregacion` (ALTA si ≥70% de las glosas matcheó un patrón claro, MEDIA si no) para que el comprador sepa cuánto confiar en cada reparto.

**Ejemplo real (código 10005123, ZAPATO DE SEGURIDAD INDUSTRIAL):**

| Talla | % histórico |
|---|---|
| 42 | 20.4% |
| 41 | 18.4% |
| 40 | 17.8% |
| 43 | 9.2% |
| 36 | 8.6% |
| 39 | 7.2% |
| 37 | 7.2% |
| 38 | 4.6% |
| 44 | 3.9% |
| 35 | 2.6% |

### 5.4 Nota técnica sobre la extracción de tallas

La primera versión del parser de glosas cometía un error real que vale la pena documentar: un texto como `"1 caja touch nthlf 92600 talla L"` interpretaba **"92600" (un número de catálogo) como si fuera una cantidad de 92,600 pares**, distorsionando por completo el reparto porcentual de ese código. Se corrigió con dos resguardos: (1) un tope de plausibilidad (una cantidad por línea de requerimiento no supera ~50 unidades en este contexto) y (2) un reescalado final que fuerza a que la suma de cantidades interpretadas por fila siempre cuadre exactamente con la cantidad real registrada en el requerimiento (`cantidad`), usando el texto libre solo para inferir *proporciones* entre variantes, nunca cantidades absolutas no verificadas.

---

## 6. Estructura del Excel entregado

`Plan_Compras_Suministros_Repuestos_Embalajes.xlsx`, 6 hojas:

1. **Resumen Ejecutivo** — KPIs generales, desglose por familia y por patrón, metodología resumida.
2. **Plan de Compra** — detalle completo (3,324 filas, incluye variantes disgregadas), con todas las columnas de contexto (stock, consumo, lead time, cobertura, proveedor, precio, criticidad, confianza).
3. **Cola Larga - Esporadicos** — subconjunto ESPORADICO (2,564 filas) para gestión diferenciada/consolidada.
4. **Cod. Genericos Talla-Color** — el detalle de los 18 códigos disgregados, con el % histórico de cada variante y su evidencia (N° de OCs analizadas).
5. **Cod. Genericos Spec Variable** — los 135 códigos de especificación libre, con ejemplos reales de glosa, para anticipar carga operativa sin fingir precisión que los datos no dan.
6. **Sin Actividad (no incluidos)** — 7,020 códigos sin patrón de consumo activo, listados por trazabilidad (no forman parte del plan de compra).

---

## 7. Limitaciones y siguientes pasos sugeridos

- La disgregación por talla/color es **estadística** (basada en el mix histórico), no una previsión por talla en sí misma — es razonable como punto de partida pero debería revisarse si el mix de tallas de la plantilla cambia (ingreso de personal nuevo, etc.).
- El parser de glosa es una heurística de texto libre (regex); con 18 códigos es revisable a mano — si el negocio quiere escalar la disgregación a más códigos genéricos (no solo EPP), convendría normalizar la captura del dato de talla en el propio formulario de requerimiento en vez de inferirlo del texto.
- No se tuvo colección de stock de seguridad EPP por trabajador ni de dotación/headcount por talla — un cruce con RR.HH. (tallas de uniforme del personal activo) daría una base aún más precisa que el solo histórico de compras.
- El valor y las cantidades están en PEN usando precio promedio ponderado o último costo; no se ajustó por inflación/tipo de cambio proyectado.
