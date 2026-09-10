/**
 * Tipos del módulo "Análisis de Rotación de Materiales". Se construye sobre
 * `/api/requerimientos/consolidado-producto` SIN filtrar por responsable
 * (catálogo completo de materiales con movimiento registrado), a diferencia
 * de "Mis Compras" que sí lo filtra.
 */

/** "sinRotacion" = sin movimiento reciente (ver RotacionConfig.diasSinMovimiento) — prevalece sobre alta/media/baja. */
export type RotacionNivel = 'alta' | 'media' | 'baja' | 'sinRotacion';

/** Derivado del campo real `familia` de Requerimientos (no se inventa una taxonomía nueva). */
export type TipoMaterial = 'suministro' | 'repuesto' | 'otro';

export type EstadoMaterial = 'activo' | 'inactivo';

/** Categorías del filtro rápido por checkboxes (acumulativo / unión, no intersección). */
export type CategoriaRotacion = 'activos' | 'estacionales' | 'bajaRotacion';

/** Umbrales configurables (sección "Configuración de criterios de rotación") — nunca hardcodeados en la lógica de negocio. */
export interface RotacionConfig {
  /** Nº de movimientos (requerimientos) a partir del cual un material es "alta rotación". */
  umbralAlta: number;
  /** Nº de movimientos a partir del cual es "media rotación" (menos que umbralAlta y al menos esto = media; menos = baja). */
  umbralMedia: number;
  /** Días sin movimiento a partir de los cuales se considera "sin rotación" (sin movimiento reciente). */
  diasSinMovimiento: number;
  /** Percentil superior de valor estimado que, combinado con rotación baja, dispara la alerta "alto valor + baja rotación". */
  percentilAltoValor: number;
}

export const DEFAULT_ROTACION_CONFIG: RotacionConfig = {
  umbralAlta: 8,
  umbralMedia: 3,
  diasSinMovimiento: 180,
  percentilAltoValor: 0.8,
};

/**
 * Registro resumido por material — es lo que se guarda en memoria/localStorage
 * tras el barrido completo del catálogo. No conserva el detalle línea por
 * línea (eso se re-consulta on-demand en el drill-down) para mantener el
 * tamaño manejable sobre ~2,700 materiales.
 */
export interface ProductoRotacion {
  codigo: string;
  producto: string;
  familia: string | null;
  unidadMedida: string | null;
  tipoMaterial: TipoMaterial;
  movimientos: number;
  cantidadTotal: number;
  cantidadPorComprar: number;
  stockActual: number | null;
  primerMovimiento: string | null;
  ultimoMovimiento: string | null;
  diasSinMovimiento: number | null;
  frecuenciaPromedioDias: number | null;
  areaPrincipal: string | null;
  solicitantePrincipal: string | null;
  proveedorPrincipal: string | null;
  precioReferencia: number | null;
  monedaReferencia: string | null;
  valorEstimado: number | null;
  nivel: RotacionNivel;
  estado: EstadoMaterial;
  /** Cantidad total solicitada por mes calendario (índice 0 = enero, 11 = diciembre), sumando todos los años del historial. */
  consumoPorMes: number[];
  /** true solo cuando hay evidencia suficiente (ver rotacionCalculations.ts) de concentración marcada en ciertos meses. */
  esEstacional: boolean;
  /** null si no hay suficientes datos históricos para identificarlo con confianza. */
  mesMayorConsumo: string | null;
  /** % en que el mes de mayor consumo supera al promedio mensual. null si no hay datos suficientes. */
  variacionConsumoPct: number | null;
}

export interface RotacionFilters {
  familia?: string;
  areaPrincipal?: string;
  proveedorPrincipal?: string;
  nivel?: RotacionNivel;
  tipoMaterial?: TipoMaterial;
  estado?: EstadoMaterial;
  /** true = solo materiales clasificados como estacionales. */
  soloEstacionales?: boolean;
  /** Filtra materiales cuyo periodo de movimiento (primer→último) se solapa con este rango. Formato ISO (YYYY-MM-DD). */
  fechaDesde?: string;
  fechaHasta?: string;
  search?: string;
  /** Filtro rápido por checkboxes: unión de categorías (activos / estacionales / baja rotación) — vacío o undefined = sin restricción. */
  categorias?: CategoriaRotacion[];
}

export type RotacionSortKey =
  | 'movimientos'
  | 'cantidadTotal'
  | 'valorEstimado'
  | 'ultimoMovimiento'
  | 'frecuenciaPromedioDias'
  | 'stockActual';

export interface CargaProgreso {
  paginaActual: number;
  totalPaginas: number;
  materialesTotales: number;
}
