import type { ConsolidadoProductoRecord } from '@/types/requerimiento';
import type { ProductoRotacion, RotacionConfig, RotacionFilters, RotacionNivel, RotacionSortKey, TipoMaterial } from '@/types/rotacion';

/**
 * Cálculo de clasificación de rotación y métricas derivadas, a partir de los
 * registros consolidados por producto que ya calcula el servidor. Todo se
 * deriva de `n_reqs`, `cantidad_demandada`, `stock_actual`, `items[].fecha/
 * cantidad/area_origen/solicita` y `proveedores_historicos` reales — ningún
 * valor se escribe a mano.
 */

export const MES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Heurística de estacionalidad: se requiere evidencia mínima (movimientos
// repartidos en varios meses distintos) antes de calificar algo como
// estacional o no — si no hay evidencia suficiente, se reporta "Dato no
// disponible" en vez de estimarlo.
const ESTACIONALIDAD_MIN_MESES_CON_DATOS = 4;
const ESTACIONALIDAD_MIN_MOVIMIENTOS = 6;
// El mes de mayor consumo debe superar al promedio mensual en al menos este % para considerarse un pico estacional real.
const ESTACIONALIDAD_UMBRAL_VARIACION_PCT = 60;

/** "sinRotacion" (sin movimiento reciente) prevalece sobre la clasificación por volumen de movimientos. */
export function classifyRotacion(movimientos: number, diasSinMovimiento: number | null, config: RotacionConfig): RotacionNivel {
  if (diasSinMovimiento !== null && diasSinMovimiento >= config.diasSinMovimiento) return 'sinRotacion';
  if (movimientos >= config.umbralAlta) return 'alta';
  if (movimientos >= config.umbralMedia) return 'media';
  return 'baja';
}

/** "Activo"/"Inactivo" es el mismo criterio de "sin movimiento reciente", expuesto como estado del material. */
export function deriveEstado(diasSinMovimiento: number | null, config: RotacionConfig): 'activo' | 'inactivo' {
  return diasSinMovimiento !== null && diasSinMovimiento >= config.diasSinMovimiento ? 'inactivo' : 'activo';
}

/** "Tipo" (suministro/repuesto) se deriva del campo real `familia` — no es una taxonomía inventada. */
export function deriveTipoMaterial(familia: string | null): TipoMaterial {
  if (familia === 'SUMINISTROS') return 'suministro';
  if (familia === 'REPUESTOS') return 'repuesto';
  return 'otro';
}

/** Valor más frecuente de una lista (moda) — usado para "área/solicitante principal". */
function moda(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  values.forEach((v) => {
    if (!v) return;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  });
  let best: string | null = null;
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  });
  return best;
}

function averageGapDays(timestampsMs: number[]): number | null {
  if (timestampsMs.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < timestampsMs.length; i += 1) gaps.push((timestampsMs[i] - timestampsMs[i - 1]) / 86_400_000);
  return gaps.reduce((a, b) => a + b, 0) / gaps.length;
}

interface Estacionalidad {
  consumoPorMes: number[];
  esEstacional: boolean;
  mesMayorConsumo: string | null;
  variacionConsumoPct: number | null;
}

/**
 * Agrupa el consumo real (cantidad solicitada) por mes calendario, sumando
 * todos los años del historial disponible. Solo se declara "estacional" un
 * material cuando hay evidencia suficiente (movimientos repartidos en varios
 * meses distintos) — si no, se reporta como "sin evidencia suficiente" y no
 * se estima nada.
 */
function buildEstacionalidad(fechasConCantidad: { ms: number; cantidad: number }[]): Estacionalidad {
  const consumoPorMes = new Array(12).fill(0) as number[];
  const mesesConDatos = new Set<number>();

  fechasConCantidad.forEach(({ ms, cantidad }) => {
    const mes = new Date(ms).getMonth();
    consumoPorMes[mes] += cantidad || 0;
    mesesConDatos.add(mes);
  });

  const totalConsumo = consumoPorMes.reduce((a, b) => a + b, 0);
  const evidenciaSuficiente = mesesConDatos.size >= ESTACIONALIDAD_MIN_MESES_CON_DATOS && fechasConCantidad.length >= ESTACIONALIDAD_MIN_MOVIMIENTOS;

  if (!evidenciaSuficiente || totalConsumo <= 0) {
    return { consumoPorMes, esEstacional: false, mesMayorConsumo: null, variacionConsumoPct: null };
  }

  const promedio = totalConsumo / 12;
  let mesPicoIdx = 0;
  consumoPorMes.forEach((v, i) => {
    if (v > consumoPorMes[mesPicoIdx]) mesPicoIdx = i;
  });

  const variacionConsumoPct = promedio > 0 ? ((consumoPorMes[mesPicoIdx] - promedio) / promedio) * 100 : 0;

  return {
    consumoPorMes,
    esEstacional: variacionConsumoPct >= ESTACIONALIDAD_UMBRAL_VARIACION_PCT,
    mesMayorConsumo: MES_NOMBRES[mesPicoIdx],
    variacionConsumoPct,
  };
}

export function buildProductoRotacion(record: ConsolidadoProductoRecord, config: RotacionConfig, now = Date.now()): ProductoRotacion {
  const fechasConCantidad = record.items
    .map((i) => ({ fecha: i.fecha, ms: i.fecha ? new Date(i.fecha).getTime() : NaN, cantidad: i.cantidad ?? 0 }))
    .filter((f) => Boolean(f.fecha) && !Number.isNaN(f.ms))
    .sort((a, b) => a.ms - b.ms);

  const primerMovimiento = fechasConCantidad[0]?.fecha ?? null;
  const ultimoMovimiento = fechasConCantidad[fechasConCantidad.length - 1]?.fecha ?? null;
  const diasSinMovimiento = ultimoMovimiento
    ? Math.floor((now - fechasConCantidad[fechasConCantidad.length - 1].ms) / 86_400_000)
    : null;

  const proveedorPrincipal =
    record.proveedores_historicos.length > 0
      ? [...record.proveedores_historicos].sort((a, b) => b.n_compras - a.n_compras)[0]
      : null;

  const estacionalidad = buildEstacionalidad(fechasConCantidad.map((f) => ({ ms: f.ms, cantidad: f.cantidad })));

  return {
    codigo: record.codigo_producto,
    producto: record.producto,
    familia: record.familia,
    unidadMedida: record.um,
    tipoMaterial: deriveTipoMaterial(record.familia),
    movimientos: record.n_reqs,
    cantidadTotal: record.cantidad_demandada,
    cantidadPorComprar: record.cantidad_a_comprar,
    stockActual: record.stock_actual,
    primerMovimiento,
    ultimoMovimiento,
    diasSinMovimiento,
    frecuenciaPromedioDias: averageGapDays(fechasConCantidad.map((f) => f.ms)),
    areaPrincipal: moda(record.items.map((i) => i.area_origen)),
    solicitantePrincipal: moda(record.items.map((i) => i.solicita)),
    proveedorPrincipal: proveedorPrincipal?.proveedor ?? null,
    precioReferencia: proveedorPrincipal?.ultimo_precio ?? null,
    monedaReferencia: proveedorPrincipal?.moneda ?? null,
    valorEstimado: proveedorPrincipal?.ultimo_precio != null ? record.cantidad_demandada * proveedorPrincipal.ultimo_precio : null,
    nivel: classifyRotacion(record.n_reqs, diasSinMovimiento, config),
    estado: deriveEstado(diasSinMovimiento, config),
    consumoPorMes: estacionalidad.consumoPorMes,
    esEstacional: estacionalidad.esEstacional,
    mesMayorConsumo: estacionalidad.mesMayorConsumo,
    variacionConsumoPct: estacionalidad.variacionConsumoPct,
  };
}

/** Re-clasifica un catálogo ya cargado con umbrales nuevos, sin volver a consultar el servidor. */
export function reclassify(materiales: ProductoRotacion[], config: RotacionConfig): ProductoRotacion[] {
  return materiales.map((m) => ({
    ...m,
    nivel: classifyRotacion(m.movimientos, m.diasSinMovimiento, config),
    estado: deriveEstado(m.diasSinMovimiento, config),
  }));
}

/** El periodo de movimiento del material (primer→último) debe solaparse con el rango pedido. Sin fechas registradas => se excluye si hay un filtro de rango activo. */
function solapaConRango(m: ProductoRotacion, desde?: string, hasta?: string): boolean {
  if (!desde && !hasta) return true;
  if (!m.primerMovimiento || !m.ultimoMovimiento) return false;
  if (hasta && m.primerMovimiento > hasta) return false;
  if (desde && m.ultimoMovimiento < desde) return false;
  return true;
}

export function applyRotacionFilters(materiales: ProductoRotacion[], filters: RotacionFilters, _config: RotacionConfig): ProductoRotacion[] {
  const term = filters.search?.trim().toLowerCase();
  return materiales.filter((m) => {
    if (filters.familia && m.familia !== filters.familia) return false;
    if (filters.areaPrincipal && m.areaPrincipal !== filters.areaPrincipal) return false;
    if (filters.proveedorPrincipal && m.proveedorPrincipal !== filters.proveedorPrincipal) return false;
    if (filters.nivel && m.nivel !== filters.nivel) return false;
    if (filters.tipoMaterial && m.tipoMaterial !== filters.tipoMaterial) return false;
    if (filters.estado && m.estado !== filters.estado) return false;
    if (filters.soloEstacionales && !m.esEstacional) return false;
    if (!solapaConRango(m, filters.fechaDesde, filters.fechaHasta)) return false;
    if (filters.categorias && filters.categorias.length > 0) {
      // Acumulativo: unión de categorías marcadas, no intersección.
      const coincide = filters.categorias.some((cat) => {
        if (cat === 'activos') return m.estado === 'activo';
        if (cat === 'estacionales') return m.esEstacional;
        if (cat === 'bajaRotacion') return m.nivel === 'baja';
        return false;
      });
      if (!coincide) return false;
    }
    if (term) {
      const haystack = `${m.codigo} ${m.producto}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function sortRotacion(materiales: ProductoRotacion[], key: RotacionSortKey, direction: 1 | -1): ProductoRotacion[] {
  const getValue = (m: ProductoRotacion): number => {
    switch (key) {
      case 'movimientos':
        return m.movimientos;
      case 'cantidadTotal':
        return m.cantidadTotal;
      case 'valorEstimado':
        return m.valorEstimado ?? -Infinity;
      case 'frecuenciaPromedioDias':
        return m.frecuenciaPromedioDias ?? Infinity;
      case 'ultimoMovimiento':
        return m.ultimoMovimiento ? new Date(m.ultimoMovimiento).getTime() : -Infinity;
      case 'stockActual':
        return m.stockActual ?? -Infinity;
      default:
        return 0;
    }
  };
  return [...materiales].sort((a, b) => (getValue(a) - getValue(b)) * direction);
}

/** Umbral de "alto valor" calculado como percentil sobre el propio catálogo cargado (no un número fijo inventado). */
export function computeAltoValorThreshold(materiales: ProductoRotacion[], percentil: number): number {
  const valores = materiales.map((m) => m.valorEstimado).filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (valores.length === 0) return Infinity;
  const idx = Math.min(valores.length - 1, Math.floor(valores.length * percentil));
  return valores[idx];
}
