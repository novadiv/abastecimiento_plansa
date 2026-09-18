# Mapeo de la plataforma NetComercial — Plásticos Nacionales

Levantamiento hecho en modo solo lectura el 2026-09-03. Toda la información de este documento
proviene de consultar el servidor; nada está supuesto salvo donde dice explícitamente "por
confirmar".

---

## 1. Topología real: no hay una base de datos, hay tres sistemas

| Componente | Ubicación | Rol real | Estado de los datos |
|---|---|---|---|
| **DBFs de FoxPro** | `192.168.1.250` → `C:\DATA-PLASTICOS\Programas\Sistemas\NetComercial\Plasticos\data\TABLAS.DBC` | **Fuente de verdad de todo lo comercial y logístico** | Vivo, hasta hoy |
| `PlaproduccionBD` (SQL Server 2008 R2 SP1) | `192.168.1.250` | Producción, manufactura, mantenimiento, calidad | Vivo, hasta hoy |
| `PLASTICOS` y 30 bases más (SQL Server) | `192.168.1.240\SQLSTARSOFT` | ERP **Starsoft** + varios sistemas de solicitudes | Sin mapear |

### 1.1 El hallazgo que cambia el plan de integración

`PlaproduccionBD` tiene un par de tablas `cabecera`/`detalle` **con los mismos nombres y casi las
mismas columnas que los DBF**, pero sus datos **se detienen el 2015-02-14** y no contienen ni una
orden de compra. Es un espejo abandonado de una migración que no se completó.

**Consecuencia:** todo lo que se lea para logística tiene que salir de los DBF, no de SQL Server.

### 1.2 SQL Server ya es el puente hacia FoxPro

`sys.servers` expone cuatro servidores vinculados preexistentes:

| Nombre | Proveedor | Destino |
|---|---|---|
| `FOX` | `VFPOLEDB` | `...\NetComercial\Plasticos\data\TABLAS.DBC` — **producción** |
| `FOX_DEMO` | `VFPOLEDB` | `...\NetComercial\Demo\data\tablas.dbc` — demo |
| `192.168.1.240\SQLSTARSOFT` | `SQLNCLI` | ERP Starsoft |
| `PLASERVIDOR` | `SQLNCLI` | Autorreferencia |

Esto resuelve el problema más caro de la integración: **el proveedor OLE DB de Visual FoxPro
existe solo en 32 bits y no hay versión de 64.** Un backend moderno (64 bits) no puede abrir un
DBF por sí mismo. Pero SQL Server 2008 R2 sí puede, y ya está configurado para hacerlo.

**Patrón de acceso a usar:**

```sql
SELECT * FROM OPENQUERY(FOX, 'SELECT ... FROM detalle WHERE ...')
```

La aplicación nueva habla **solo** SQL Server. No necesita ningún driver de FoxPro.

**Reglas de uso de `OPENQUERY` aprendidas en el levantamiento:**

- **Agregar siempre del lado de VFP**, dentro de la cadena. `COUNT(*)` desde fuera trae la tabla
  completa por la red y tarda minutos; el mismo `COUNT(*)` embebido responde en segundos.
- El predicado embebido sí se empuja al motor VFP (`WHERE 1=0` responde instantáneo).
- Literales de fecha en sintaxis VFP: `{^2025-01-01}`.
- Cadenas con comillas dobles dentro de la cadena remota: `docu_id = "011"`.
- `IIF()`, `EMPTY()`, `COUNT(DISTINCT ...)`, `GROUP BY` y `ORDER BY` funcionan.
- `YEAR()` dentro de `GROUP BY` **falla** con "Error no especificado" — agrupar por la fecha y
  derivar el año en Python.
- Comparar un campo `char` con `="1"` puede dar `Operator/operand type mismatch`: filtrar del
  lado de SQL Server en vez de dentro de la cadena remota.

---

## 2. El modelo de datos de NetComercial

### 2.1 Un solo par cabecera/detalle para todos los documentos

No hay una tabla por tipo de documento. Hay **una** tabla `cabecera` (185 columnas) y **una**
`detalle` (129 columnas), discriminadas por `docu_id`, que apunta al catálogo `documentos`
(130 tipos definidos).

**Clave compuesta:** `empresa_id + docu_id + docuserie + docunum`
(en el detalle se agrega `item`).

Existe un segundo par `cabeceragen`/`detallegen` que contiene **solo órdenes de trabajo** (tipo
056, 127.041 documentos). No es relevante para compras.

### 2.2 Trazabilidad entre documentos

La cadena se representa con hasta cuatro referencias, tanto en cabecera como a nivel de ítem:

- Cabecera: `docref_id` / `docrefserie` / `docrefnum` (y las variantes `2` y `3`).
- Detalle: `docref_id` / `docrefserie` / `docrefnum` + **`itemdocref`** (y variantes `2`, `3`, `4`).

Que la referencia exista **a nivel de ítem** es lo que permite reconstruir entregas parciales y la
agrupación de varios requerimientos de almacén en un requerimiento de compra.

### 2.3 Correlativos: NO se usa MAX+1

Hay una tabla `correlativos` con clave `empresa_id + dcto_id + dcto_serie + almacen_id` y columna
`correlativo`, más `correlañomes` / `correlaño`. Esto es **buena noticia para el futuro**: si
algún día se escribe desde afuera, el número se reserva en esa tabla y no hay carrera con el
`.exe` por lectura del máximo. También implica que **escribir un documento sin actualizar
`correlativos` produce un documento roto.**

Series relevantes activas:

| `dcto_id` | Serie | Descripción | `correlativo` |
|---|---|---|---|
| 007 | 001 | SERIE DE ORDEN DE PEDIDO 001 | 4514213 |
| 007 | 002 | ORDEN DE COMPRA - CONTABLE | 4476539 |

Los almacenes usan una serie por almacén: los tipos `008` y `009` tienen unas 60 series cada uno,
una por `almacen_id`.

---

## 3. El flujo real de logística, según los datos

Reconstruido agrupando `docu_id` × `docref_id` sobre documentos de 2025 en adelante.

```
056 ORDEN DE TRABAJO
 |
 |-- 71.435 -->  058 REQUERIMIENTO DE ALMACEN  ---- 63.388 ---->  009 SALIDA INTERNA
 |                                                                 (despacho real)
 |-- 13.614 -->  050 REQUERIMIENTO DE COMPRA
                        |
                        |  (no hay 007 ORDEN DE COMPRA en los datos)
                        v
                 011 PARTE INGRESO COMPRA LOCAL   +   021 PROVISION DE COMPRAS
                     (ingreso fisico, sin docref)      (factura del proveedor, por item)
```

### 3.1 Cinco hallazgos que contradicen el diagnóstico inicial

**a) El módulo de Orden de Compra no se usa.** El tipo `007` está definido en el catálogo y tiene
correlativos asignados, pero **no existe un solo documento `007`** ni en los DBF ni en SQL, ni
como documento ni como referencia de otro. La compra se registra directamente como `011 PARTE
INGRESO COMPRA LOCAL` (el ingreso físico) y `021 PROVISION DE COMPRAS` (la factura del
proveedor).

*Impacto:* el Entregable 2 no puede basarse en órdenes de compra porque no hay. Se basa en `011`
y `021`, que son mejores: son lo que efectivamente llegó y lo que efectivamente se pagó.

**b) El requerimiento de compra NO referencia al requerimiento de almacén en la cabecera.** De
15.921 requerimientos de compra, 13.614 referencian la **orden de trabajo** (`056`) y ninguno
referencia un `058`. El vínculo req. almacén → req. compra, si existe, está a nivel de ítem
(`detalle.docref_id`) y hay que verificarlo.

**c) Las salidas internas SÍ se están registrando.** 91.490 documentos `009` desde 2025-01-02, de
los cuales 63.388 referencian un requerimiento de almacén, con 170.960 ítems. El problema del
kardex no es que no se registre nada — hay que medir **cuánto se registra tarde** comparando
`fecdocumen` del `058` contra el `009` que lo atiende, y qué proporción de requerimientos
aprobados nunca recibió salida.

**d) El requerimiento de almacén nace de una orden de trabajo, no de una persona suelta.** 71.435
de 75.656 requerimientos referencian una OT de mantenimiento. Esto cambia el diseño del portal:
el requerimiento tiene contexto de OT.

**e) Los requerimientos de almacén se disparan desde 2019 y los de compra solo existen desde
2025.** Los DBF tienen ventanas históricas distintas por tipo de documento, probablemente por
purgas parciales.

### 3.2 Estados y aprobación — parcialmente resuelto

`cabecera` tiene `estado`, `estado2`, `flagaprobar`, `usuarioaprob`, `fechaaprob`. Hay **un solo**
juego `usuarioaprob`/`fechaaprob`, no dos.

Distribución observada (documentos desde 2025):

| Tipo | `estado` | `estado2` | `flagaprobar` | Documentos |
|---|---|---|---|---|
| 050 REQ. COMPRA | A | E | S | 13.029 |
| 050 | *(vacío)* | *(vacío)* | S | 1.006 |
| 050 | R | L | S | 985 |
| 050 | R | *(vacío)* | S | 327 |
| 058 REQ. ALMACEN | R | E | S | 38.683 |
| 058 | R | *(vacío)* | S | 27.573 |
| 058 | E | E | S | 3.180 |
| 058 | E | *(vacío)* | S | 2.653 |
| 058 | R | L | S | 1.977 |

**Por confirmar con Wilfredo o por observación controlada:** el significado exacto de cada letra
(`A`, `R`, `E`, `L`, `P`) en `estado` y `estado2`, y si la doble aprobación de finanzas y
contabilidad se representa con esos dos campos. Con un solo `usuarioaprob` **no se puede saber
quién de los dos aprobó ni cuándo**, lo que tiene una consecuencia directa: la métrica "cuánto
tarda cada aprobador" no es reconstruible del histórico, solo a futuro y desde el sistema nuevo.

**No existe tabla de flujo de aprobación.** Se probaron `aprobaciones`, `autorizaciones`, `flujo`,
`vistobueno`, `niveles` y variantes: ninguna existe en el DBC. Los campos de cabecera se
sobreescriben, así que **el histórico de rechazos no existe y no es recuperable.**

---

## 4. Tablas del dominio de compras y almacén

### 4.1 `detalle` — la tabla del análisis

Columnas relevantes para rotación:

| Columna | Uso |
|---|---|
| `docu_id`, `docuserie`, `docunum`, `item` | Identidad del ítem |
| `fecregistro` | Fecha del movimiento |
| `producto_id` | SKU (`char(25)`) |
| `cantidad`, `cantidad2`, `um1`, `um2` | Cantidad y unidades |
| `precio_uni`, `valor_venta`, `monto_neto` | Importes |
| `moncompra`, `tipocambio` | **Moneda del ítem** — 1 = SOLES, 2 = DÓLARES |
| `costo_unit`, `costoprommn`, `costopromme` | Costeo |
| `saldostock` | Saldo al momento del movimiento |
| `almacen_id`, `ccosto_id`, `gasto_id` | Almacén, centro de costo, partida de gasto |
| `prov_id` | Proveedor |
| `referencia`, `glosadetalle` | **Texto libre** — clave para servicios y para deduplicar |
| `docref_*` + `itemdocref` | Trazabilidad al documento origen |
| `cant_pend`, `cant_facturada` | Pendiente y facturado — entregas parciales |
| `campodel` | Marca de borrado de FoxPro |
| `docu_anul` | Anulación |

### 4.1.1 Dónde está realmente el precio de una compra

Esto es lo más importante de toda la tabla y no se deduce del nombre de las columnas.

**`precio_uni` está SIEMPRE en cero en los documentos de ingreso de compra (011).** Verificado
sobre todo el histórico: 0 filas con valor en 2015, en 2020 y en 2025. Un análisis de precios
construido sobre esa columna da exactamente cero y parece funcionar.

El costo real vive en otras cuatro columnas:

| Columna | Qué contiene |
|---|---|
| `costo_unit` | Costo unitario en la **moneda de compra** |
| **`costounitmn`** | **Costo unitario en SOLES, ya convertido por el propio NetComercial** |
| **`costototalmn`** | **Costo total en SOLES** |
| `monto_neto` | Importe en la moneda del ítem, **con IGV incluido** |

Fila real que lo demuestra: `moncompra = 2` (dólares), `costo_unit = 40,51`,
`costounitmn = 137,734` → 40,51 × 3,40. Y `monto_neto = 47,80` → 40,51 × 1,18, o sea el costo con
IGV en dólares.

**Consecuencias para cualquier análisis:**

1. Usar `costounitmn`/`costototalmn` evita reconvertir lo que el sistema ya convirtió con el tipo
   de cambio del día de la operación.
2. Son **costo neto**. `monto_neto` lleva IGV, y el IGV es recuperable: no pertenece a un análisis
   de compras. Usar `monto_neto` infla todo un 18 %.
3. Cobertura del histórico: **7.198 de 7.904** ítems en 2015, **11.449 de 11.452** en 2020 y
   **12.888 de 12.892** en 2025. Es más fiable que `monto_neto`, que en 2025 falta en más filas.

**Y de todos modos:** donde haya que recurrir a `monto_neto` —servicios del documento 021, por
ejemplo— hay que convertirlo con `moncompra` y `tipocambio` antes de sumar. Sumar sin convertir
mezcla soles y dólares.

### 4.2 Volumen y ventana histórica de `detalle`

| `docu_id` | Documento | Ítems | Desde | Hasta |
|---|---|---|---|---|
| **021** | PROVISION DE COMPRAS (factura proveedor) | **205.918** | **2014-12-26** | hoy |
| 009 | SALIDA INTERNA | 170.960 | 2025-01-01 | hoy |
| 058 | REQUERIMIENTO DE ALMACEN | 170.054 | 2019-02-17 | hoy |
| **011** | PARTE INGRESO COMPRA LOCAL | **122.942** | **2015-01-02** | hoy |
| 008 | PARTE INGRESO VARIOS | 101.869 | 2025-01-01 | *(6017-06-30 — dato sucio)* |
| 001 | FACTURA (venta) | 101.491 | 2014-12-31 | hoy |
| 003 | PEDIDO DE CLIENTE | 93.560 | 2014-12-01 | hoy |
| 050 | REQUERIMIENTO DE COMPRA | 33.173 | 2025-01-02 | hoy |
| 004 | GUIA DE REMISION | 32.244 | 2025-01-02 | hoy |

**Casi 12 años de compras con producto, cantidad y precio.** Suficiente para P95, coeficiente de
variación y estacionalidad con holgura.

### 4.3 `productos` — 122 columnas, con campos de reposición sin usar

| Columna | Observación |
|---|---|
| `producto_id`, `producto_name`, `cod`, `codigoalterno` | Identidad y códigos alternos |
| `familia_id`, `linea_id`, `sublinea_id` | Jerarquía → `familias`, `lineas`, `sublineas` |
| `marca_id`, `marca`, `modelo` | Marca (catálogo + texto libre: fuente de duplicados) |
| `unidmedi_id`, `unidmedi_eq`, `cantidad_eq` | Unidad y equivalencias → `unidades` |
| `tipoprod_id` | Tipo de producto (distingue bien/servicio — por confirmar) |
| **`stockminimo`** | **Existe; por medir cuántos artículos lo tienen poblado** |
| **`leadtime`** | **Existe** |
| **`lotereposicion`, `tiemporeposicion`** | **Existen** |
| `anexorespstockminimo_id`, `codigorespstockminimo_id` | Responsable del stock mínimo |
| `costo_actu`, `costo_prov`, `costoprommn`, `costopromme` | Costos |
| `ult_comp`, `fec_ult_comp` | Última compra y su fecha |
| **`ult_sali`, `fec_ult_sali`** | **Última salida y su fecha — indicador de antigüedad del kardex** |
| `ult_ingreso`, `fec_ult_ingreso` | Último ingreso |
| `estado`, `feccreacion`, `fecmodi` | Vigencia |

**El sistema ya tiene la estructura para punto de reorden y nunca se usó.** Eso convierte la
propuesta de reposición automática en "poblar campos que ya existen", no en un desarrollo nuevo.

### 4.4 Stock: saldos mensuales, no kardex

`stoc2024`, `stoc2025`, `stoc2026` — **una tabla por año**, 19 columnas:

```
empresa_id, producto_id, prov_id, almacen_id, ultfecha,
sal_inic, sal_ener, sal_febr, sal_marz, sal_abri, sal_mayo, sal_juni,
sal_juli, sal_agos, sal_sept, sal_octu, sal_novi, sal_dici
```

- El stock actual es la columna del mes en curso de `stoc<año actual>`.
- **`ultfecha` es la fecha del último movimiento** por producto y almacén. Es el dato exacto para
  el semáforo de confiabilidad: "el sistema dice N unidades, último movimiento hace X días".
- No es un kardex: no hay una fila por movimiento. El movimiento está en `detalle`; esto es el
  acumulado. Cualquier recálculo se hace desde `detalle`.

### 4.5 Catálogos

| Tabla | Columnas útiles |
|---|---|
| `documentos` | `documen_id`, `documen_name`, `documen_abre`, `tipodcto`, `estado` (130 tipos) |
| `proveedores` | 57 columnas |
| `familias` | `familia_id`, `familia_name`, `tipoprod_id` |
| `lineas` | `familia_id`, `linea_id`, `linea_name` + cuentas contables |
| `sublineas` | `familia_id`, `linea_id`, `sublinea_id`, `sublinea_name` |
| `unidades` | `unidmedi_id`, `unidad`, `unidmedi_name`, `condecimal`, `codsunat` |
| `marcas` | `marca_id`, `marca_name` |
| `centrocosto` | `ccosto_id`, `descripcion`, `tipoccosto` |
| `gastos` | `gasto_id`, `gasto_name` + enlace contable |
| `monedas` | `1` = SOLES, `2` = DOLARES AMERICANOS |
| `tipocambio` | `tc_fecha`, `tc_compra`, `tc_venta` — serie histórica |
| `almacenes` | 16 columnas |
| `almacenuser` | `usuario_id`, `empresa_id`, `almacen_id` — **qué almacén ve cada usuario** |
| `empresas` | 50 columnas, 1 registro |

### 4.6 `usuarios` — 16 columnas

```
usuario_id, usuario_name, direccion, ciudad, codpostal, telefonos,
tipodcto_id, numedcto, tipotrab_id, areaorigen_id, cargo_id,
fecingreso, fecretiro, estado, email, emailcopia
```

- **Sí hay `email` y `emailcopia`.** Un aviso por correo no requiere cargar datos a mano.
- Hay `telefonos`, pero por poblar y validar antes de usarlo para WhatsApp.
- Hay `areaorigen_id` y `cargo_id`.
- **NO hay campo de jefe inmediato.** Confirmado: el mapeo colaborador → jefe no existe en el
  sistema y hay que construirlo en la base propia.

---

## 5. Estado del servidor SQL Server

### 5.1 El backup de 818 GB es un problema de tres tablas, no de volumen de negocio

| Tabla | Filas | Tamaño |
|---|---|---|
| `Audit_ManufacDet` | 1.895.772.765 | **529 GB** |
| `Audit_ManufacSubDet` | 618.153.574 | **248 GB** |
| `Audit_ManufacCab` | 129.073.193 | **32 GB** |
| *Todo el resto de la base* | — | **menos de 6 GB** |

**El 99,2 % de la base son tres tablas de auditoría de manufactura.** La tabla de negocio más
grande después de ellas pesa 3,6 GB.

*Consecuencia directa:* la afirmación "no se puede restaurar un backup porque es de 1 TB" es
cierta hoy y **deja de serlo** si esas tres tablas se archivan o purgan. Una base de unos 6 GB se
restaura en minutos en cualquier instancia. Esto habilita el entorno de pruebas que hoy no
existe, y probablemente también mejore el rendimiento y la ventana de backup. Es una conversación
que vale tener con Wilfredo y con Fernando, y es independiente de este proyecto.

### 5.2 Otros datos de estado

- Versión completa: `Microsoft SQL Server 2008 R2 (SP1) - 10.50.2550.0 (Intel X86) ... Enterprise
  Edition on Windows NT 6.1 (WOW64)`. **`Intel X86` sobre `WOW64` significa que la instancia es de
  32 bits** corriendo sobre un Windows de 64. Ese detalle es lo que hace posible toda la
  integración: el proveedor OLE DB de Visual FoxPro solo existe en 32 bits, y por eso puede
  cargarse dentro de este SQL Server. En una instancia de 64 bits el vínculo `FOX` no funcionaría.
- Sin soporte desde julio de 2019.
- Modelo de recuperación de `PlaproduccionBD`: **SIMPLE** → no hay recuperación a un punto en el
  tiempo; solo se puede volver al último backup completo.
- Servicio reiniciado el 2026-09-03 06:30.
- Nivel de compatibilidad: 100 (SQL Server 2008).
- Otras bases: `PlaDigitalizacion` (4 GB; tablas `Escaneos` con 81.244 filas, `Conciliacion`,
  `Planos`), `ReportServer`.

### 5.3 Actividad real observada (día 2026-09-03)

Las tablas que la aplicación estaba usando: `Manufactura*`, `TORDEN*`, `TOCURRENCIA`,
`tiempocambio*`, `CCCertificado*`, `valcontcal`, `temrepsegpers`. **Ninguna lectura ni escritura
sobre compras, proveedores o productos** — confirma que ese dominio no vive en SQL Server.

### 5.4 Limitaciones de SQL Server 2008 R2 que condicionan el código

No existen (llegaron en 2012 o después): `PERCENTILE_CONT`, `PERCENTILE_DISC`, `LAG`, `LEAD`,
`SUM() OVER (ORDER BY ...)`, `OFFSET`/`FETCH`, `IIF`, `CONCAT`, `TRY_CONVERT`, `FORMAT`,
`STRING_AGG`, `THROW`. Sí existen `ROW_NUMBER`, `RANK`, `NTILE` y `OVER (PARTITION BY)` simple.

**Decisión derivada:** el SQL contra el legacy se limita a filtrar y agregar. **Toda la
estadística (percentiles, coeficiente de variación, estacionalidad, ABC/XYZ) se calcula en
Python.**

---

## 6. Calidad de datos: lo que hay que limpiar antes de creer un número

1. **Fechas basura.** Aparecen `1899-12-30` (fecha vacía de FoxPro), `6017-06-30`, `2062-05-19`.
   Todo análisis debe acotar el rango y contar cuántas filas descarta.
2. **Tipos de documento basura**: `xxx`, `ttt`, `yyy`, `gg`, `FFF`, `SSS`, `XXX`, `ccc` — pruebas
   de alguien, con pocas filas.
3. **Documentos de prueba en el catálogo**: tipos 062, 063, 067, 068, 069 con nombres tipo
   "AAASSDD" o "prueba de ingreso".
4. **`campodel` y `docu_anul`**: FoxPro marca borrados en vez de eliminarlos. **Filtrarlos siempre
   o los totales salen inflados.**
5. **Moneda mezclada**: convertir con `moncompra` + `tipocambio` antes de sumar importes.
6. **Ítems sin producto**: en `021` hay 1.518 ítems sin `producto_id` de 32.807. Van al análisis
   de servicios por texto, no al de artículos.
7. **Duplicados de catálogo**: `marca` es texto libre además de `marca_id`; `referencia` y
   `glosadetalle` son libres. Es la fuente principal de duplicados de artículo y hay que
   consolidar antes de rankear.
8. **Tablas espejo abandonadas** en SQL Server: `SNC_Productos_OLD`, `snc_productos2`,
   `SNC_Productos-VIEJO`, `ManufacturaSubDetalleDetalleERICK`, `DocumentosOTsDetCOPIA`. No usar.
9. **Byte nulo (`0x00`) incrustado en campos de texto.** Apareció en `proveedores`, fila 1793.
   PostgreSQL rechaza el byte nulo en texto y **aborta la carga entera**, no la fila. Hay que
   eliminar los bytes de control antes de cargar.
10. **Relleno con espacios en los `char(n)`.** Es como FoxPro almacena; sin recortar,
    `'PERNO   '` y `'PERNO'` son claves distintas y toda agrupación queda partida.

### 6.1 Cifras medidas de la limpieza (carga del 2026-09-03)

| Campo | Fechas imposibles anuladas |
|---|---|
| `productos.fec_ult_comp` | 15.594 |
| `productos.fec_ult_sali` | 15.387 |
| `productos.fec_ult_ingreso` | 7.748 |

Sobre **26.440 artículos** en el DBF. Es decir: más de la mitad del catálogo no tiene fecha
utilizable de última compra ni de última salida.

**El catálogo del DBF duplica al del espejo SQL:** 26.440 artículos en FoxPro contra 13.087 en
`PlaproduccionBD.productos`. Otra confirmación de que el espejo quedó congelado.

### 6.2 Coste de lectura medido

Carga completa del 2026-09-03, tiempos reales por consulta `OPENQUERY`:

| Tabla | Rango | Filas | Segundos | Filas/s |
|---|---|---|---|---|
| `detalle` | 2015–2019 | 94.634 | 46 | 2.057 |
| `detalle` | 2019–2023 | 126.904 | 64 | 1.983 |
| `detalle` | 2023–2026 | 481.833 | 226 | 2.132 |
| `cabecera` | 2015–2019 | 36.226 | 12 | 3.019 |
| `cabecera` | 2019–2023 | 42.602 | 14 | 3.043 |
| `cabecera` | 2023–2026 | 224.601 | 56 | 4.011 |

**El coste es proporcional a las filas devueltas, no un coste fijo por barrido.** El rendimiento
se mantiene en unas 2.000 filas/segundo para `detalle` y 3.000–4.000 para `cabecera`, con mucha
consistencia entre tramos. Extracción completa: **unos 7 minutos** para 1,0 millones de filas.

Consecuencia práctica: trocear el rango **no cambia el tiempo total**, solo la memoria del
proceso. Lo que sí lo cambia es **cuántas filas se piden**, así que la palanca real es el filtro,
no el troceo.

*(Una medición aislada anterior sugirió un coste fijo de ~85 s por consulta. Era un tramo grande
malinterpretado: con seis mediciones el patrón lineal es inequívoco.)*

**Nota sobre el volumen por época:** el tramo 2023–2026 tiene 481.833 ítems frente a 94.634 del
tramo 2015–2019. O el uso del sistema creció mucho, o los años antiguos fueron purgados
parcialmente. Conviene saber cuál antes de sacar conclusiones de tendencia a largo plazo.

---

## 7. Fuentes definitivas para el Entregable 2 (rotación)

| Pregunta de negocio | Fuente | `docu_id` | Ventana |
|---|---|---|---|
| ¿Qué se compró de verdad, cuánto y a qué precio? | `cabecera`+`detalle` | **011** | 2015 → hoy |
| ¿Qué facturó el proveedor, por ítem? | `cabecera`+`detalle` | **021** | 2014-12 → hoy |
| ¿Qué pidieron los usuarios? (demanda) | `cabecera`+`detalle` | **058** | 2019-02 → hoy |
| ¿Qué se pidió comprar? | `cabecera`+`detalle` | **050** | 2025-01 → hoy |
| ¿Qué se consumió realmente? | `cabecera`+`detalle` | **009** | 2025-01 → hoy |
| ¿Cuánto hay hoy y de cuándo es el dato? | `stoc2026` | — | Mes en curso |
| Maestro de artículos | `productos` + `familias`/`lineas`/`unidades` | — | — |
| Proveedores | `proveedores` | — | — |
| Tipo de cambio para consolidar a soles | `tipocambio` | — | Serie histórica |

**Servicios:** al no existir órdenes de compra, un servicio se identifica por ítems sin
`producto_id` o por `gasto_id`, con el texto en `referencia`/`glosadetalle`. Requiere
clasificación por texto; es un trabajo aparte del de artículos.

**Prueba de viabilidad ya ejecutada:** el top de compras por importe sobre `011` en los últimos
24 meses devuelve **4.406 artículos distintos** y corre en segundos agregando del lado de VFP.

---

## 8. Pendientes de verificación

1. Significado de las letras de `estado` y `estado2` por tipo de documento.
2. ¿Dónde se registra el rechazo de finanzas y contabilidad, y existe motivo de rechazo?
3. ¿El vínculo `058` → `050` está a nivel de ítem en `detalle.docref_id`?
4. ¿Qué distingue un bien de un servicio: `tipoprod_id`, `familia_id` o la ausencia de producto?
5. ¿Cuántos artículos tienen `stockminimo`, `leadtime` y `lotereposicion` poblados?
6. Cuánto tarda un `058` en recibir su `009` (latencia real de despacho).
7. Qué proporción de `058` aprobados nunca recibió salida ni pasó a `050`.
8. Qué hay en `192.168.1.240\SQLSTARSOFT` y si compras usa Starsoft para algo.
9. `proveedores` (57 columnas) y `almacenes` (16) sin detallar aún.

---

## 9. Verificación del 2026-09-14 — correcciones al documento

Segundo levantamiento, hecho con el usuario de solo lectura `plansareader` al
construir el módulo de Plan de Abastecimiento. Todo lo de abajo está medido, no
supuesto. **Corrige errores de las secciones anteriores.**

### 9.1 Errores corregidos

| Sección | Decía | Es en realidad |
|---|---|---|
| 4.4 | La columna de septiembre es `sal_sept` | Es **`sal_seti`**. Además existe **`sal_actu`**, que es el saldo vigente y es la columna que hay que usar — no la del mes en curso. |
| 4.1 | `glosadetalle` es texto libre útil para deduplicar | **Está vacío en el 100 % de los casos**: 0 de 80.371 ítems de 058 en 2026. Lo mismo `cabecera.glosa`: 0 de 36.209. El único texto libre con contenido es **`referencia`**, en 6.887 ítems (8,6 %). |

### 9.2 Reglas nuevas de `OPENQUERY` (aprendidas fallando)

- **`TOP n` dentro de la cadena remota exige `ORDER BY`.** Sin él devuelve
  *"Cannot get the column information"*, que no se parece en nada a la causa.
  Lo práctico es aplicar `TOP` del lado de SQL Server.
- **`estado` es `Decimal` en `productos`, `familias`, `unidades` y `almacenes`,
  pero `char` en `cabecera`.** Compararlo sin convertir revienta de formas
  distintas según la tabla.
- **Los `JOIN` sí funcionan dentro de la cadena remota**, incluso con
  `GROUP BY` encima. Es lo que permite filtrar por área (que vive en cabecera)
  mientras se agrega el detalle. Un `JOIN` + `GROUP BY` sobre el año completo
  tarda ~14 s.

### 9.3 Respuestas a pendientes de la sección 8

**Pendiente 3 — ¿el vínculo está a nivel de ítem?** Sí, y funciona: de 72.268
ítems de salida interna (`009`) en 2026, **57.924 (80 %) referencian su
requerimiento de almacén** por `docref_id`/`docrefserie`/`docrefnum`. Eso
permite calcular cuánto de lo solicitado ya se despachó. El 20 % restante se
despachó sin referencia y no es atribuible.

**Dato nuevo — `cant_pend` sí está poblado.** 44.353 de 80.372 ítems de `058` en
2026 tienen `cant_pend > 0`, sumando 6,5 millones de unidades frente a 71
millones solicitados. Es el pendiente que calcula el propio NetComercial, y
sirve de contraste independiente frente al que se deduce de las salidas.

### 9.4 Catálogo de áreas

La tabla es **`areasorigen`** (no `areas` ni `areaorigen`): `empresa_id`,
`areaorigen_id`, `descripcion`, `glosa`, `usuario_id`, `feccreacion`, `fecmodi`,
`estado`, `tipocosteo_id`. 67 áreas. Las que más requerimientos generan en 2026:

| Código | Área | Requerimientos |
|---|---|---|
| 07 | MATERIA PRIMA | 13.832 |
| 05 | EMBALAJES | 8.286 |
| 21 | PRODUCTOS TERMINADOS | 3.538 |
| 03 | MANTENIMIENTO | 2.014 |
| 58 | *(sin descripción)* | 1.548 |

### 9.5 Volumen de 2026 (1 de enero → 14 de septiembre)

| Medida | Valor |
|---|---|
| Requerimientos de almacén (`058`) | 36.209 documentos |
| Ítems de esos requerimientos | 80.371 |
| Productos distintos pedidos | 4.145 |
| Artículos en el maestro | 26.523 (23.529 activos) |
| Productos con registro de stock | 19.117 |

### 9.6 `011` y `021` se duplican — no sumar ambos

Cada compra genera un `011` (ingreso físico, **con** costo real en
`costounitmn`/`costototalmn`) y un `021` (provisión, **misma cantidad** y costo
cero). Verificado sobre el artículo 10004443: las tres compras de 2026 (300, 100
y 100 unidades) aparecen por duplicado. **Cualquier análisis de cantidades
compradas debe usar solo `011`**; sumar los dos duplica las unidades.

### 9.7 CORRECCIÓN MAYOR: las órdenes de compra SÍ existen

**El hallazgo (a) de la sección 3.1 es falso.** Decía que el módulo de orden de
compra no se usa porque no hay ningún documento `007`. Es cierto que no hay
documentos `007` en `cabecera` — pero **las órdenes de compra no viven ahí**.

Viven en su propio par de tablas: **`pedidoscab` / `pedidosdet`**. Encaja con la
pista que ya estaba en la sección 2.3 y que no se siguió: el correlativo de
`007`/`001` se llamaba *"SERIE DE ORDEN DE PEDIDO 001"* y valía 4.514.213. Las
órdenes reales llevan justo esa numeración.

Descubierto el 2026-09-14 al contrastar un reporte que el usuario exportó del
NetComercial (`REPORTE DE ORDENES DE COMPRA DEL 14/09/2025 AL 14/09/2026`) con
los números del dashboard. Las 22 líneas del reporte se reprodujeron **exactas**
desde `pedidosdet`: mismos números de orden, fechas, cantidades y costos.

**Volumen en 2026:** 12.345 líneas, 5.322 órdenes, 2.959 productos distintos.
Es un módulo plenamente en uso.

**Estados de `pedidoscab.estado`** (confirmados contra las etiquetas del reporte
oficial — resuelve parte del pendiente 1 de la sección 8):

| Valor | Significa |
|---|---|
| `A` | ATENDIDA — 4.726 órdenes en 2026 |
| `R` | APROBADA — 596 órdenes en 2026 |

**Columnas útiles de `pedidoscab`:** `docu_id`, `docuserie`, `docunum`,
`fecdocumen`, `tipoorden_id`, `prov_id`, `prov`, `moneda_id`, `tipocambio`,
`estado`, `flagaprobar`, `usuarioaprob`, `fechaaprob`, `areaorigen_id`,
`ccosto_id`, `fechaentrega`, `lugarentrega`, `formapago`, `dias_cred`,
`observac`, `estadocierre`, `incoterm`, `agente_ad`.

**Columnas útiles de `pedidosdet`:** `producto_id`, `cantidad`, `cant_pend`,
`costo_unit`, `valor_compra`, `monto_neto`, `monto_aten`, `flagatendido`,
`prov_id`, `docref_id`/`docrefserie`/`docrefnum` (apunta a la OT), `gasto_id`,
`ccosto_id`, `areaorigen_id`, `referencia`, `memo`.

**Consecuencia:** el Entregable 2 y cualquier análisis de compras deberían usar
`pedidoscab`/`pedidosdet` como fuente de la orden de compra, y `011` solo para
el ingreso físico. Son cosas distintas: para el artículo 10003824 entre el
14/09/2025 y el 14/09/2026 hay **105 unidades en órdenes atendidas** y **115 en
ingresos `011`**.

### 9.8 Las cuatro cifras de un mismo artículo no son intercambiables

Medido sobre 10003824 (CAJAS DE AGUA DE MESA DE 20LT), 14/09/2025 → 14/09/2026:

| Concepto | Unidades | Fuente |
|---|---|---|
| Lo que pidieron las áreas | 144 | `detalle` 058 |
| Lo que se les entregó | 120 | `detalle` 009 |
| Lo que se ordenó al proveedor (atendido) | **105** | `pedidosdet` + `pedidoscab` estado `A` |
| Lo que entró físicamente | 115 | `detalle` 011 |

Ninguna es "la" cantidad. Confundirlas es la forma más fácil de que dos informes
del mismo artículo no cuadren.

### 9.9 Stock negativo

Hay productos con `sal_actu` negativo — se despachó sin registrar el ingreso. No
es inventario, es un kardex descuadrado, y tomarlo como saldo real hace que un
cálculo de reposición pida cantidades absurdas (un servicio con saldo −152.000
llegó a sugerir comprar 152.000 unidades). Hay que tratarlo como cero y marcarlo.
