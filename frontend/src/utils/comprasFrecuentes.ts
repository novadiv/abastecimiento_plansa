import type { ConsolidadoProductoRecord, FrecuenciaNivel, ProductoFrecuente } from '@/types/requerimiento';

/**
 * Deriva "productos que compro frecuentemente" a partir de los registros
 * consolidados por producto que ya calcula el servidor. Ninguno de estos
 * valores se escribe a mano: la clasificación y la frecuencia salen del
 * historial real (`items[].fecha`, `n_reqs`, `proveedores_historicos`).
 */

// Umbrales de clasificación por cantidad de requerimientos históricos.
// Son un criterio de negocio razonable y uniforme — no un dato inventado por producto.
const UMBRAL_ALTA = 8;
const UMBRAL_MEDIA = 3;

export function classifyFrecuencia(nReqs: number): FrecuenciaNivel {
  if (nReqs >= UMBRAL_ALTA) return 'alta';
  if (nReqs >= UMBRAL_MEDIA) return 'media';
  return 'baja';
}

function averageGapDays(fechasIso: string[]): number | null {
  const timestamps = fechasIso
    .map((f) => new Date(f).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  if (timestamps.length < 2) return null;

  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i += 1) {
    gaps.push((timestamps[i] - timestamps[i - 1]) / 86_400_000);
  }
  return gaps.reduce((acc, g) => acc + g, 0) / gaps.length;
}

function pickProveedorPrincipal(record: ConsolidadoProductoRecord) {
  if (record.proveedores_historicos.length === 0) return null;
  return [...record.proveedores_historicos].sort((a, b) => b.n_compras - a.n_compras)[0];
}

export function buildProductoFrecuente(record: ConsolidadoProductoRecord): ProductoFrecuente {
  const fechas = record.items.map((i) => i.fecha).filter((f): f is string => Boolean(f));
  const fechasOrdenadas = [...fechas].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const proveedorPrincipal = pickProveedorPrincipal(record);

  return {
    codigo: record.codigo_producto,
    producto: record.producto,
    familia: record.familia,
    unidadMedida: record.um,
    vecesComprado: record.n_reqs,
    cantidadTotal: record.cantidad_demandada,
    cantidadPorComprar: record.cantidad_a_comprar,
    primeraCompra: fechasOrdenadas[0] ?? null,
    ultimaCompra: fechasOrdenadas[fechasOrdenadas.length - 1] ?? null,
    frecuenciaPromedioDias: averageGapDays(fechas),
    proveedorPrincipal: proveedorPrincipal?.proveedor ?? null,
    comprasAlProveedorPrincipal: proveedorPrincipal?.n_compras ?? null,
    precioReferencia: proveedorPrincipal?.ultimo_precio ?? null,
    monedaReferencia: proveedorPrincipal?.moneda ?? null,
    // Estimación: cantidad total demandada × último precio conocido del proveedor principal.
    // Es una aproximación (los precios varían en el tiempo), no una suma histórica exacta.
    valorEstimado:
      proveedorPrincipal?.ultimo_precio != null ? record.cantidad_demandada * proveedorPrincipal.ultimo_precio : null,
    nivelFrecuencia: classifyFrecuencia(record.n_reqs),
  };
}

export function buildProductosFrecuentes(records: ConsolidadoProductoRecord[]): ProductoFrecuente[] {
  return records.map(buildProductoFrecuente).sort((a, b) => b.vecesComprado - a.vecesComprado);
}

/** Proveedores distintos entre los productos actualmente cargados (ver nota de alcance en la UI). */
export function countProveedoresDistintos(records: ConsolidadoProductoRecord[]): number {
  const set = new Set<string>();
  records.forEach((r) => r.proveedores_historicos.forEach((p) => set.add(p.proveedor)));
  return set.size;
}
