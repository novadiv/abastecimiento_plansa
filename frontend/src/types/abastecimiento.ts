/**
 * Tipos del módulo de Abastecimiento.
 *
 * Reflejan exactamente lo que devuelve el backend de FastAPI que lee el ERP
 * NetComercial (DBF de FoxPro vía SQL Server). Los nombres de campo están en
 * español porque así vienen de la API y así se nombran en el negocio.
 */

/** Sobre qué histórico se estima el ritmo mensual de salida de un artículo. */
export type BaseConsumo = 'compras' | 'consumo' | 'requerimientos' | 'ordenes';

/** Semáforo de urgencia de reposición. */
export type EstadoAbastecimiento = 'critico' | 'urgente' | 'atencion' | 'ok' | 'sin-consumo';

export interface FiltrosAbastecimiento {
  desde: string;
  hasta: string;
  area: string;
  usuario: string;
  almacen: string;
  base: BaseConsumo;
  meses: number;
  soloPorComprar: boolean;
  incluirPendiente: boolean;
  /** Filtra a los códigos que le tocan a un comprador de logística. */
  comprador: string;
}

/** Una fila de la tabla: un producto con todos sus requerimientos sumados. */
export interface ItemConsolidado {
  codigo: string;
  descripcion: string;
  unidad: string;
  familia: string;
  activo: boolean;

  /** Usuario de logística al que le toca comprar este código. */
  comprador: string;
  /** Cuán fiable es esa asignación: el ERP no la guarda, se deduce. */
  comprador_confianza: 'alta' | 'media' | 'baja' | 'sin-datos';
  /** De dónde sale: del histórico de órdenes, de un relevo o puesta a mano. */
  comprador_origen: 'historico' | 'relevo' | 'manual' | '';

  /** Total pedido por las áreas en el periodo. */
  solicitado: number;
  /** Lo que ya salió de almacén contra esos requerimientos. */
  atendido: number;
  /** Lo solicitado que aún no se ha entregado. */
  pendiente: number;
  /** El pendiente según el propio ERP (`cant_pend`), como contraste. */
  pendiente_erp: number;
  lineas: number;
  documentos: number;
  primera_fecha: string | null;
  ultima_fecha: string | null;

  stock_actual: number;
  /** Saldo negativo = kardex descuadrado. El cálculo lo trata como cero. */
  stock_negativo: boolean;
  stock_minimo: number;
  stock_ultimo_movimiento: string | null;
  /** Ya pedido al proveedor y aún sin llegar. Se descuenta de lo que hay que comprar. */
  en_camino: number;

  base_consumo: BaseConsumo;
  cantidad_base: number;
  ritmo_mensual: number;
  /** Meses que dura el stock actual al ritmo observado. */
  cobertura_meses: number | null;
  /** Fecha estimada en que el stock llega a cero. */
  fecha_quiebre: string | null;
  meses_objetivo: number;
  sugerido_comprar: number;
  costo_unitario: number;
  importe_estimado: number;
  estado: EstadoAbastecimiento;

  comprado_periodo: number;
  veces_comprado: number;
  ultima_compra: string | null;

  ordenado_periodo: number;
  ordenes_periodo: number;
  ultima_orden: string | null;
}

export interface ResumenConsolidado {
  desde: string;
  hasta: string;
  meses_periodo: number;
  meses_objetivo: number;
  base_consumo: BaseConsumo;
  base_consumo_etiqueta: string;
  incluir_pendiente: boolean;
  productos: number;
  productos_por_comprar: number;
  mostrados: number;
  documentos: number;
  lineas: number;
  importe_estimado: number;
  stock_negativo: number;
  con_pedido_en_camino: number;
  criticos: number;
  urgentes: number;
  atencion: number;
  ok: number;
  sin_consumo: number;
}

export interface RespuestaConsolidado {
  items: ItemConsolidado[];
  resumen: ResumenConsolidado;
}

/** Un requerimiento individual de los que componen el total consolidado. */
export interface RequerimientoDetalle {
  documento: string;
  serie: string;
  numero: string;
  item: number;
  fecha: string | null;
  usuario: string;
  usuario_nombre: string;
  area_id: string;
  area: string;
  centro_costo: string;
  almacen: string;
  cantidad: number;
  atendido: number;
  pendiente: number;
  pendiente_erp: number;
  /** Lo despachado se reparte a prorrata si el documento repite el producto. */
  atendido_aproximado: boolean;
  /** Único texto libre con contenido real: los campos de glosa están vacíos. */
  referencia: string;
  orden_trabajo: string;
  estado: string;
  estado2: string;
  aprobado: boolean;
  usuario_aprueba: string;
  fecha_aprobacion: string | null;
  fecha_entrega: string | null;
}

export interface DetalleProducto {
  codigo: string;
  descripcion: string;
  unidad: string;
  total_solicitado: number;
  total_atendido: number;
  total_pendiente: number;
  con_referencia: number;
  requerimientos: RequerimientoDetalle[];
}

export interface PuntoSerieMensual {
  mes: string;
  compras: number;
  consumo: number;
  requerimientos: number;
  importe: number;
}

export interface CompraHistorica {
  fecha: string;
  documento: string;
  cantidad: number;
  costo_unitario: number;
  importe: number;
  moneda_compra: 'USD' | 'PEN';
  almacen: string;
}

export interface HistorialProducto {
  codigo: string;
  descripcion: string;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  serie_mensual: PuntoSerieMensual[];
  compras: CompraHistorica[];
  totales: {
    comprado: number;
    consumido: number;
    solicitado: number;
    importe: number;
    costo_promedio: number;
    veces_comprado: number;
  };
}

// ── Sustento: la demostración aritmética del ritmo ────────────────────

/** Una orden de compra puesta al proveedor, con lo que ya llegó de ella. */
export interface OrdenCompra {
  documento: string;
  numero: string;
  fecha: string | null;
  cantidad: number;
  recibido: number;
  pendiente: number;
  costo_unitario: number;
  importe: number;
  estado: string;
  estado_texto: string;
  proveedor: string;
  moneda: 'USD' | 'PEN';
  fecha_entrega: string | null;
  usuario: string;
  referencia: string;
  ingresos: { documento: string; fecha: string | null }[];
}

/** Un documento que respalda una cifra del mes, para poder ir a comprobarlo. */
export interface DocumentoRespaldo {
  tipo: BaseConsumo;
  documento: string;
  fecha: string | null;
  cantidad: number;
}

export interface MesSustento {
  mes: string;
  compras: number;
  consumo: number;
  requerimientos: number;
  ordenes: number;
  importe: number;
  /** Falso si el filtro corta el mes por la mitad: no es comparable. */
  completo: boolean;
  documentos: DocumentoRespaldo[];
}

export interface EstadisticaSustento {
  meses_completos: number;
  minimo: number | null;
  maximo: number | null;
  promedio: number | null;
  desviacion: number | null;
  variabilidad_pct: number | null;
  estabilidad: 'estable' | 'variable' | 'erratico' | 'sin-datos';
}

export interface ComparacionBase {
  base: BaseConsumo;
  etiqueta: string;
  fuente: string;
  total: number;
  ritmo_mensual: number;
  seleccionada: boolean;
}

export interface SustentoProducto {
  codigo: string;
  descripcion: string;
  unidad: string;
  periodo: { desde: string; hasta: string; dias: number; meses: number };
  base: { id: BaseConsumo; etiqueta: string; fuente: string };
  calculo: {
    total_periodo: number;
    meses_periodo: number;
    ritmo_mensual: number;
    meses_objetivo: number;
    necesidad: number;
    stock_actual: number;
    en_camino: number;
    sugerido_comprar: number;
    formula: string;
  };
  serie_mensual: MesSustento[];
  totales: {
    compras: number;
    consumo: number;
    requerimientos: number;
    ordenes: number;
    importe: number;
  };
  estadistica: EstadisticaSustento;
  comparacion_bases: ComparacionBase[];
  ordenes: OrdenCompra[];
  ordenes_pendientes: OrdenCompra[];
  total_en_camino: number;
  stock_ultimo_movimiento: string | null;
}

export interface OpcionCatalogo {
  id: string;
  nombre: string;
}

export interface CatalogosAbastecimiento {
  areas: OpcionCatalogo[];
  almacenes: OpcionCatalogo[];
  usuarios: OpcionCatalogo[];
  bases_consumo: OpcionCatalogo[];
  /** Usuarios de logística entre los que se reparten los códigos. */
  compradores: string[];
}

// ── Proveedores: a quién comprarle ────────────────────────────────────

export interface CompraProveedor {
  fecha: string | null;
  documento: string;
  cantidad: number;
  precio_soles: number;
  moneda: 'USD' | 'PEN';
  precio_original: number;
}

export interface ProveedorProducto {
  proveedor_id: string;
  proveedor: string;
  ordenes: number;
  unidades: number;
  importe_soles: number;
  precio_min: number;
  precio_max: number;
  precio_promedio: number;
  /** Precio de la última orden, convertido a soles. Es el criterio de orden. */
  ultimo_precio: number;
  primera_compra: string | null;
  ultima_compra: string | null;
  dias_credito: number;
  monedas: string[];
  compradores: string[];
  es_mejor_precio: boolean;
  es_mas_reciente: boolean;
  es_mas_usado: boolean;
  costo_estimado: number | null;
  sobrecosto_vs_mejor: number;
  sobrecosto_pct: number;
  historial: CompraProveedor[];
}

export interface ProveedoresProducto {
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad_referencia: number | null;
  proveedores: ProveedorProducto[];
  sin_historial: boolean;
  mejor_precio?: number;
  ahorro_maximo?: number | null;
  periodo?: { desde: string; hasta: string };
  aviso: string;
}

// ── Plan de órdenes: qué girar, a quién y cada cuánto ─────────────────

export type Urgencia =
  | 'sin-stock'
  | 'esta-semana'
  | 'quince-dias'
  | 'treinta-dias'
  | 'holgado';

export interface LineaOrden {
  codigo: string;
  descripcion: string;
  unidad: string;
  familia: string;
  comprador: string;
  stock_actual: number;
  en_camino: number;
  ritmo_mensual: number;
  pendiente: number;
  cantidad: number;
  dias_restantes: number | null;
  urgencia: Urgencia;
  estado: EstadoAbastecimiento;
  precio: number;
  importe: number;
  consumo_anual: number;
}

export interface OrdenProveedor {
  proveedor_id: string;
  proveedor: string;
  /** Cada cuántos meses conviene girarle una orden a este proveedor. */
  ciclo_meses: number;
  ciclo_teorico: number;
  ordenes_por_anio: number;
  valor_anual: number;
  lineas: LineaOrden[];
  n_lineas: number;
  importe: number;
  /** Lo que falta invertir para que este proveedor aguante su ciclo. */
  inversion_colchon: number;
  dias_min: number | null;
  urgencia: Urgencia;
  compradores: string[];
}

export interface ResumenCiclo {
  ciclo_meses: number;
  proveedores: number;
  codigos: number;
  valor_anual: number;
  ordenes_anio: number;
  inversion: number;
}

export interface PlanOrdenes {
  ordenes: OrdenProveedor[];
  sin_proveedor: LineaOrden[];
  excluidos: { familia: string; codigos: number; importe: number }[];
  por_ciclo: ResumenCiclo[];
  urgencias: Record<string, { lineas: number; importe: number }>;
  resumen: {
    desde: string;
    hasta: string;
    base_consumo: BaseConsumo;
    base_consumo_etiqueta: string;
    meses_objetivo: number;
    comprador: string;
    ordenes_a_girar: number;
    lineas: number;
    importe: number;
    sin_proveedor: number;
    codigos_excluidos: number;
    importe_excluido: number;
    ordenes_anio_plan: number;
    ordenes_mes_plan: number;
    inversion_colchon: number;
    costo_orden: number;
    tasa_almacen: number;
    costo_almacen_anual: number;
  };
}

export interface TipoProducto {
  id: string;
  nombre: string;
  familias: string[];
}

export interface MaestroCompradores {
  compradores: string[];
  activos: string[];
  inactivos: string[];
  relevos: Record<string, string>;
  productos_por_comprador: Record<string, number>;
  manuales: number;
  total_asignados: number;
  por_confianza: { alta: number; media: number; baja: number };
}
