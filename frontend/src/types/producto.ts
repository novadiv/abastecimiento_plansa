/**
 * Tipos del dominio "Productos" tal como los expone la API real
 * (`GET /api/productos`). A diferencia de la versión basada en Excel,
 * aquí el esquema SÍ es conocido y fijo, así que se modela explícitamente
 * en vez de inferirlo en tiempo de ejecución.
 *
 * Se tipan fuertemente los campos que el dashboard usa (KPIs, filtros,
 * tabla, análisis). El índice `[key: string]: unknown` cubre el resto de
 * campos que la API devuelve (son casi 90 en total) sin recurrir a `any`.
 */

export interface StockPorAlmacen {
  nombre: string;
  stock: number;
}

export interface Producto {
  codigo: string;
  nombre: string;
  status: string | null;
  familia_nombre: string | null;
  linea_nombre: string | null;
  unidad_medida: string | null;

  tendencia: string | null;
  tendencia_cambio_pct: number | null;

  stock_actual: number | null;
  stock_proyectado: number | null;
  stock_mp_total: number | null;
  stock_mp_por_almacen: Record<string, StockPorAlmacen> | null;
  min_stock_estacional: number | null;

  on_order: number | null;
  on_order_valor_usd: number | null;
  on_order_valor_pen: number | null;

  cobertura_actual: number | null;
  cobertura_proyectada: number | null;

  compra_sugerida: number | null;
  valor_compra_usd: number | null;
  valor_compra_pen: number | null;
  valor_mensual: number | null;
  total_valorizado: number | null;

  consumo_ultimo_mes: number | null;
  consumo_ultimos_3m: number | null;
  consumo_ultimos_6m: number | null;
  prom_12m: number | null;
  p95_12m: number | null;
  future_consumption: number | null;

  ultimo_costo: number | null;
  moneda_costo: string | null;
  precio_promedio_ponderado: number | null;
  precio_confiabilidad: string | null;
  precio_cv: number | null;

  confidence_level: string | null;
  confidence_score: number | null;
  confidence_action: string | null;

  criticidad: string | null;
  criticidad_justificacion: string | null;
  segmento_abc: string | null;
  patron_consumo: string | null;
  patron_descripcion: string | null;

  lead_time: number | null;
  lead_time_dias: number | null;
  proveedor: string | null;
  fecha_ultima_compra: string | null;

  [key: string]: unknown;
}

export interface ConfiabilidadBreakdown {
  confiable: number;
  revision: number;
  precaucion: number;
  no_confiable: number;
}

/** Agregados calculados por el servidor sobre el conjunto de productos que cumple los filtros actuales. */
export interface ProductosTotales {
  stock_valorizado_usd: number;
  stock_cantidad: number;
  precio_promedio_unitario: number;
  on_order_cantidad: number;
  on_order_valorizado_usd: number;
  on_order_valorizado_pen: number;
  on_order_items: number;
  valorizado_con_por_llegar_usd: number;
  precio_promedio_unitario_con_por_llegar: number;
  compra_sugerida_usd: number;
  compra_sugerida_pen: number;
  valor_mensual_usd: number;
  valor_mensual_corregido_usd: number;
  consumo_prom_mensual: number;
  consumo_p95_mensual: number;
  consumo_3m_mensual: number;
  consumo_6m_mensual: number;
  confiabilidad: ConfiabilidadBreakdown;
}

export interface ProductosResponse {
  success: boolean;
  data: Producto[];
  total: number;
  page: number;
  pages: number;
  totales: ProductosTotales;
}

export interface CatalogoOpcion {
  nombre: string;
  cantidad: number;
}

/**
 * Versión recortada de `Producto` — solo los campos que se muestran en la
 * tabla — usada para guardar el catálogo COMPLETO (23,000+ productos) en
 * memoria/localStorage sin acercarse a la cuota del navegador (el objeto
 * `Producto` completo trae ~90 campos por fila).
 */
export interface ProductoResumen {
  codigo: string;
  nombre: string | null;
  familia_nombre: string | null;
  linea_nombre: string | null;
  status: string | null;
  criticidad: string | null;
  segmento_abc: string | null;
  proveedor: string | null;
  stock_actual: number | null;
  cobertura_actual: number | null;
  compra_sugerida: number | null;
  valor_compra_usd: number | null;
  total_valorizado: number | null;
  tendencia: string | null;
  precio_confiabilidad: string | null;
}

export interface CargaProgresoProductos {
  paginaActual: number;
  totalPaginas: number;
  productosTotales: number;
}

/** Parámetros aceptados por `GET /api/productos` que el dashboard utiliza. */
export interface ProductosQuery {
  page: number;
  limit: number;
  sort_by: string;
  sort_order: 1 | -1;
  search?: string;
  familia?: string;
  linea?: string;
  status?: string;
  criticidad?: string;
  segmento_abc?: string;
  tendencia?: string;
}

export const DEFAULT_PRODUCTOS_QUERY: ProductosQuery = {
  page: 1,
  limit: 25,
  sort_by: 'total_valorizado',
  sort_order: -1,
};

export interface ConfianzaBreakdownGlobal {
  'MUY BAJA': number;
  BAJA: number;
  MEDIA: number;
  ALTA: number;
  'MUY ALTA': number;
}

/** Respuesta de `GET /api/dashboard/kpis` — indicadores globales de todo el sistema (no solo productos). */
export interface DashboardKpis {
  total_productos: number;
  productos_compra_sugerida: number;
  valor_compra_pen: number;
  valor_compra_usd: number;
  ordenes_pendientes: number;
  requerimientos_pendientes: number;
  confiabilidad: ConfianzaBreakdownGlobal;
  ultimo_calculo: string;
  run_id: string;
}
