/**
 * Tipos del dominio "Requerimientos" (`/api/requerimientos/*`), usados por
 * el módulo "Mis Compras". La API no expone un campo de usuario/comprador
 * en Órdenes de Compra — el proxy más cercano a "comprador" que sí existe
 * es `responsable` dentro de Requerimientos (ver config/responsableMapping.ts).
 */

export interface RequerimientoItem {
  id_requerimiento: string;
  req_nro: string;
  producto?: string;
  codigo_producto?: string;
  familia?: string;
  area_origen: string | null;
  solicita: string | null;
  usuario?: string | null;
  fecha: string | null;
  cantidad: number | null;
  cantidad_entregada_real: number | null;
  saldo_pendiente: number | null;
  estado_calculado: string | null;
  estado_normalizado: string | null;
  nro_oc: string | null;
  fecha_entrega_oc: string | null;
  tiene_oc: boolean;
  tipo_abastecimiento: string | null;
  cantidad_a_comprar: number | null;
  dias_pendiente: number | null;
  responsable: string | null;
  estado_gestion?: string | null;
}

export interface ProveedorHistorico {
  proveedor: string;
  n_compras: number;
  ultimo_precio: number | null;
  ultima_fecha: string | null;
  ultima_oc: string | null;
  moneda: string | null;
}

export interface ConsolidadoProductoRecord {
  codigo_producto: string;
  producto: string;
  familia: string | null;
  um: string | null;
  responsable: string;
  stock_actual: number | null;
  n_reqs: number;
  cantidad_demandada: number;
  cantidad_entregada: number;
  saldo_total: number;
  cantidad_a_comprar: number;
  n_pendientes: number;
  n_atendidos: number;
  n_en_proceso: number;
  req_nros: string[];
  items: RequerimientoItem[];
  proveedores_historicos: ProveedorHistorico[];
  pct_atencion: number;
}

export interface ConsolidadoProductoKpis {
  total_productos: number;
  total_reqs: number;
  total_pendientes: number;
  total_a_comprar: number;
  sin_oc: number;
}

export interface ConsolidadoProductoResponse {
  success: boolean;
  data: ConsolidadoProductoRecord[];
  total: number;
  page: number;
  pages: number;
  kpis: ConsolidadoProductoKpis;
}

export interface RequerimientosListaResponse {
  success: boolean;
  data: RequerimientoItem[];
  total: number;
  page: number;
  pages: number;
}

export interface RequerimientosKpis {
  total_requerimientos: number;
  atendidos: number;
  parciales: number;
  sin_entrega: number;
  cantidad_total_pedida: number;
  cantidad_total_entregada: number;
  saldo_real_total: number;
  con_salidas: number;
  tasa_atencion: number;
  promedio_dias_atencion: number | null;
}

export interface StatsOC {
  con_oc: number;
  sin_oc: number;
  valor_con_oc: number;
  valor_sin_oc: number;
}

export interface RequerimientosFiltrosOptions {
  años: number[];
  familias: string[];
  areas: string[];
  responsables: string[];
  estados_normalizados: string[];
  proveedores: string[];
}

export interface MisComprasFilters {
  año?: number;
  mes?: number;
  familia?: string;
  area_origen?: string;
  proveedor?: string;
  estado_normalizado?: string;
  search?: string;
}

/** Clasificación visual de recurrencia — calculada a partir de `n_reqs`, nunca escrita a mano. */
export type FrecuenciaNivel = 'alta' | 'media' | 'baja';

export interface ProductoFrecuente {
  codigo: string;
  producto: string;
  familia: string | null;
  unidadMedida: string | null;
  vecesComprado: number;
  cantidadTotal: number;
  cantidadPorComprar: number;
  primeraCompra: string | null;
  ultimaCompra: string | null;
  frecuenciaPromedioDias: number | null;
  proveedorPrincipal: string | null;
  comprasAlProveedorPrincipal: number | null;
  precioReferencia: number | null;
  monedaReferencia: string | null;
  valorEstimado: number | null;
  nivelFrecuencia: FrecuenciaNivel;
}
