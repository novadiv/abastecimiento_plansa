# Dashboard de Abastecimiento

Dashboard empresarial construido con **React + Vite + TypeScript** que consulta
**en vivo** la API interna de Logística/Compras de la empresa (módulo
"Productos") — con inicio de sesión, filtros y paginación resueltos del lado
del servidor, ya que el catálogo tiene más de 23,000 productos.

> Esta versión reemplaza a una anterior basada en carga manual de Excel. Se
> migró a conexión directa con la base de datos en vivo — ver la sección
> "Arquitectura" más abajo.

## Requisitos

- [Node.js](https://nodejs.org/) 18 o superior (incluye npm).
- Acceso de red al servidor interno (VPN o red local de la empresa).
- Un usuario válido del sistema de Logística/Compras (mismas credenciales que
  usas en `http://10.147.17.86:3000/`).

## Instalación

```bash
cd frontend
npm install
```

## Configuración

La URL de la API se define en `.env` (ya incluido, apunta al servidor
interno):

```
VITE_API_BASE_URL=http://10.147.17.86:8000/api
```

Si el servidor cambia de IP/puerto, edita ese único valor — no hace falta
tocar código. `.env` no se versiona (ver `.gitignore`); `.env.example` documenta
la variable para quien clone el proyecto.

## Cómo ejecutar

```bash
npm run dev
```

Abre la URL que muestra la terminal (por defecto `http://localhost:5173`) e
inicia sesión con tu usuario del sistema de Logística.

Otros scripts:

```bash
npm run build    # build de producción (tsc + vite build)
npm run preview  # sirve el build de producción localmente
npm run lint     # chequeo de tipos con tsc --noEmit
```

## Inicio de sesión

El dashboard **no guarda ningún usuario ni contraseña en el código** — cada
persona inicia sesión con su propio usuario contra `POST /auth/login`, y el
token de sesión se guarda únicamente en el `localStorage` de su navegador
(`abastecimiento_dashboard_auth_token`). Si el token expira o el servidor lo
invalida, la app vuelve a la pantalla de login automáticamente.

## Módulo "Análisis de Rotación de Materiales"

Clasifica automáticamente TODOS los materiales con movimiento (no solo los
de un responsable) en Alta / Media / Baja rotación, con rankings, alertas
("sin movimiento reciente", "alto valor + baja rotación") y drill-down por
material. Se construye sobre `GET /api/requerimientos/consolidado-producto`
**sin** filtrar por responsable — mismo endpoint que "Mis Compras", pero en
alcance global.

Dos cosas importantes de esta implementación:

1. **Es una consulta pesada**: el servidor tarda ~15-18 segundos por página
   de 200 materiales (máximo permitido), y hay ~2,763 materiales en total
   (~14 páginas). Por eso el módulo:
   - Carga el catálogo completo **una sola vez** en segundo plano, con una
     barra de progreso visible.
   - Cachea el resultado (ya resumido por material, sin el detalle línea a
     línea) en `localStorage` por 24 horas. El botón "Actualizar catálogo"
     fuerza una recarga completa.
   - A partir de ahí, todos los filtros/orden/clasificación ocurren en el
     navegador — instantáneo, sin volver a golpear el servidor.
   - El drill-down por material (clic en una fila) sí hace una consulta
     puntual y liviana (`search=<código>`) para traer su historial completo.
2. **"Tipo de material" = campo `familia`** de Requerimientos (incluye
   `SUMINISTROS`, `REPUESTOS` y otras categorías reales del sistema — no se
   inventó una taxonomía nueva). "Área principal" y "Proveedor principal"
   son el valor más frecuente entre los movimientos de cada material (una
   aproximación a nivel de material, no un filtro transaccional). El "valor
   comprado" es una estimación (cantidad total × último precio conocido del
   proveedor principal) — se etiqueta como "aprox." en toda la UI porque la
   API no expone un monto histórico exacto por material.
3. Los umbrales de clasificación (qué cuenta como alta/media/baja rotación,
   días para "sin movimiento reciente", percentil de "alto valor") son
   editables desde la sección **"Configuración de criterios de rotación"**
   dentro del propio módulo — se guardan en `localStorage` y se aplican al
   instante sobre el catálogo ya cargado, sin tocar código.

### Clasificación extendida: Sin rotación y Estacionales

Además de Alta/Media/Baja, el módulo clasifica dos categorías adicionales,
siempre a partir de datos reales — nunca estimadas quando no hay evidencia:

- **Sin rotación**: materiales cuyo `diasSinMovimiento` supera el umbral
  configurado (mismo criterio que antes era solo una alerta, ahora es un
  nivel propio que prevalece sobre Alta/Media/Baja). Se cruza con
  `stock_actual` para señalar candidatos a **stock inmovilizado**.
- **Estacionales**: se agrupa el consumo real (`items[].fecha` + `cantidad`)
  por mes calendario, sumando todos los años del historial. Un material se
  marca como estacional solo si (a) tiene movimientos repartidos en al menos
  4 meses distintos y al menos 6 movimientos en total, y (b) su mes pico
  supera en 60%+ al promedio mensual — si no hay evidencia suficiente, se
  muestra "Dato insuficiente" en vez de adivinar. Ver
  `ESTACIONALIDAD_*` en `utils/rotacionCalculations.ts` para los umbrales
  exactos (no son configurables desde la UI, a diferencia de los de
  rotación).

Otros campos nuevos en la tabla/ficha de cada material: **Tipo** (suministro/
repuesto, derivado de `familia`), **Estado** (Activo/Inactivo, mismo criterio
que "sin rotación"), **Stock actual** (`stock_actual` de la API, sin
transformar). El filtro "Movimiento desde/hasta" es una aproximación:
compara el rango pedido contra el periodo primer→último movimiento de cada
material (no contra cada transacción individual, que no se conserva en el
catálogo resumido).

> La estructura de `ProductoRotacion` cambió al agregar estos campos — la
> caché de `localStorage` se versionó a `rotacion_catalogo_cache_v2` para
> invalidar cachés viejas automáticamente (ver `useRotacionCatalog.ts`).

## Módulo "Mis Compras"

Vista personal de compras, separada del Dashboard general (que sigue
mostrando a todos los compradores). Importante: **las Órdenes de Compra no
tienen un campo de usuario/comprador** en la base de datos actual (se
verificó contra el listado, los pendientes y el detalle completo de OC — sin
éxito). El proxy más cercano que sí existe es el campo `responsable` del
módulo **Requerimientos**, así que "Mis Compras" se construye sobre esos
datos (pedidos internos de almacén), no sobre Órdenes de Compra a
proveedor en sentido estricto.

- `src/config/responsableMapping.ts` asocia el `usuario` de login con el
  `responsable` real de Requerimientos (ej. `jcamacho → 'JEANPIERO PEREA'`).
  Para dar de alta a un nuevo comprador, agregar una línea a ese mapa.
- Si un usuario no está en el mapa, "Mis Compras" le muestra un selector
  para elegir su nombre de la lista de responsables; la elección se guarda
  en `localStorage` de su navegador (sin tocar código ni reiniciar el
  servidor).
- Los "productos que compra frecuentemente" y su clasificación
  (🔴 alta / 🟡 media / 🟢 baja, según la cantidad de requerimientos
  históricos) salen de `GET /requerimientos/consolidado-producto`, que ya
  agrupa por producto en el servidor — no se descarga el historial completo
  al navegador para calcularlo.
- El "valor estimado" por producto es una aproximación (cantidad total ×
  último precio conocido del proveedor principal) y se marca como "aprox."
  en la tabla — la API no expone un monto histórico exacto a nivel de
  producto.

## Estructura del proyecto

```text
src/
├── components/
│   ├── auth/            LoginScreen
│   ├── dashboard/       KPICard, ProductosFilters, ProductosTable, Charts (+ charts/*)
│   ├── layout/          Sidebar, Header, Layout
│   └── common/          EmptyState, LoadingState, ErrorState, Badge
├── pages/               Dashboard, Data, Analysis, Settings
├── services/
│   ├── apiClient.ts        cliente HTTP base (Bearer token, manejo de 401)
│   ├── authService.ts      login / logout / auth/me
│   ├── productosService.ts productos, familias, líneas, KPIs globales
│   └── exportService.ts    exportar la página actual a CSV
├── utils/
│   ├── apiCalculations.ts  KPIs/gráficos/insights a partir de los agregados del servidor
│   ├── chartTheme.ts       paleta de colores compartida
│   └── formatters.ts       formateo de número/moneda/fecha/porcentaje
├── hooks/
│   ├── useAuth.ts          estado de sesión
│   ├── useProductos.ts     filtros + paginación + fetch de productos
│   ├── useFamiliasLineas.ts opciones de los selects de familia/línea
│   ├── useDashboardKpis.ts KPIs globales del sistema
│   └── useHashRoute.ts     router mínimo basado en el hash de la URL
├── context/
│   ├── AuthContext.tsx      sesión disponible en toda la app
│   └── ProductosContext.tsx datos/filtros/KPIs/gráficos de Productos
├── types/
│   ├── auth.ts          AuthUser, LoginResult
│   ├── producto.ts       Producto, ProductosQuery/Response, DashboardKpis
│   └── dashboard.ts      KPIDefinition, ChartConfig, AnalysisInsight (genéricos de UI)
├── App.tsx / main.tsx
```

La separación se mantiene: **UI (components/pages) → estado (hooks/context) →
acceso a datos (services) → tipos (types)**.

## Arquitectura: por qué paginación/filtrado en el servidor

El Excel original tenía 700 filas y se podía cargar entero en memoria. El
catálogo real de la API tiene **23,000+ productos** con ~90 campos cada uno,
así que:

- `GET /api/productos` recibe `page`, `limit`, `sort_by`, `sort_order` y los
  filtros (`search`, `familia`, `linea`, `status`, `criticidad`,
  `segmento_abc`, `tendencia`) — la tabla solo pide la página visible.
- Esa misma respuesta incluye un bloque `totales` calculado por el servidor
  **sobre el conjunto ya filtrado** (valorización, consumo, confiabilidad),
  que es lo que alimenta los KPIs y gráficos del Dashboard/Análisis — así no
  hace falta descargar miles de filas al navegador solo para sumarlas.
- `GET /api/dashboard/kpis` aporta un puñado de indicadores globales del
  sistema completo (órdenes/requerimientos pendientes) que no dependen de los
  filtros de la tabla de Productos.
- `GET /api/productos/familias` y `GET /api/productos/lineas?familia=...`
  alimentan los selects de Familia/Línea con conteos reales.

## Cómo agregar un nuevo KPI o gráfico

1. Si el dato ya viene en `totales` o en `/dashboard/kpis` (ver
   `types/producto.ts`), agrega el bloque correspondiente en
   `utils/apiCalculations.ts` (`buildKpiCards` / `buildCharts` /
   `buildAnalysisInsights`), siguiendo el patrón existente.
2. Si necesitas un dato que la API no expone todavía, es un cambio de
   backend — no se debe inventar ni aproximar en el frontend.
3. No hace falta tocar `KPICard`, `Charts` ni `Analysis`: ya renderizan
   cualquier elemento que estas funciones devuelvan.

## Extender a otros módulos

La API completa (`http://10.147.17.86:8000/docs`) expone muchos más módulos
(Órdenes, Requerimientos, Cotizaciones, Importaciones, Proveedores,
Homologaciones, etc.). Este dashboard se mantiene enfocado en **Productos**,
igual que la versión anterior basada en Excel. Para incorporar otro módulo:
crear su propio `services/<modulo>Service.ts` + `hooks/use<Modulo>.ts`
siguiendo el mismo patrón que `productosService.ts`/`useProductos.ts`, y una
página/pestaña nueva que los consuma.

## Seguridad

- Ningún usuario/contraseña vive en el código fuente ni en `localStorage`
  (solo el token de sesión, que expira).
- Se removió la dependencia `xlsx` (tenía 2 vulnerabilidades altas sin parche
  publicado — prototype pollution y ReDoS). La exportación a CSV ahora se
  genera a mano, sin librerías externas.
- `npm audit` puede seguir mostrando una vulnerabilidad moderada de `esbuild`
  que solo afecta al servidor de desarrollo local (`npm run dev`), no al build
  de producción.
