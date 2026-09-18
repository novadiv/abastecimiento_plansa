import type { ConsolidadoProductoRecord } from '@/types/requerimiento';
import type { MaterialPanorama, PanoramaFilters, PanoramaNivel, PanoramaRecomendacion } from '@/types/panorama';
import { buildEstacionalidad } from './estacionalidad';

/**
 * Clasificación de "Panorama de Materiales" (Mis Compras) — 4 categorías
 * MUTUAMENTE EXCLUYENTES a partir de datos reales (`n_reqs`, fechas de
 * `items[]`, cantidades). Nunca se inventa nivel, estacionalidad ni
 * recomendación: todo se deriva del historial consolidado que ya calcula
 * el servidor para este responsable.
 */

// Mismos umbrales usados en el resto del proyecto (Mis Compras clásico y
// Materiales y Rotación) — criterio de negocio uniforme, no un valor por producto.
const UMBRAL_ALTA = 8;
const UMBRAL_MEDIA = 3;

// Cobertura objetivo por nivel, replicando la metodología ya validada en
// docs/analisis_plan_compras.md (cobertura escalonada, no un "2 meses" fijo
// para todo el universo): alta rotación → 2 meses, media → 3 meses. Baja
// rotación no se abastece proactivamente (comprar solo bajo requerimiento).
// Estacional no tiene un número de meses fijo — depende de la temporada.
const COBERTURA_MESES: Record<PanoramaNivel, number | null> = {
  alta: 2,
  media: 3,
  estacional: null,
  baja: 0,
};

/**
 * La estacionalidad prevalece sobre el conteo de movimientos: un material
 * puede solicitarse pocas veces en total y aun así ser claramente estacional
 * (ej. 4 pedidos, todos en diciembre). Por eso se evalúa primero, y solo si
 * NO hay evidencia de patrón estacional se clasifica por volumen.
 */
function classifyPanorama(nReqs: number, esEstacional: boolean): PanoramaNivel {
  if (esEstacional) return 'estacional';
  if (nReqs >= UMBRAL_ALTA) return 'alta';
  if (nReqs >= UMBRAL_MEDIA) return 'media';
  return 'baja';
}

function buildRecomendacion(nivel: PanoramaNivel, reqPendientes: number): PanoramaRecomendacion {
  if (nivel === 'alta') return reqPendientes > 0 ? 'COMPRAR AHORA' : 'PROGRAMAR';
  if (nivel === 'media') return 'PROGRAMAR';
  if (nivel === 'estacional') return 'REVISAR TEMPORADA';
  return 'NO ABASTECER';
}

/** Meses reales de actividad entre la primera y la última solicitud (mínimo 1, para no dividir por 0 con una sola fecha). */
function mesesDeActividad(primera: string | null, ultima: string | null): number {
  if (!primera || !ultima) return 1;
  const dias = (new Date(ultima).getTime() - new Date(primera).getTime()) / 86_400_000;
  return Math.max(1, dias / 30);
}

function pickProveedorPrincipal(record: ConsolidadoProductoRecord) {
  const proveedores = record.proveedores_historicos ?? [];
  if (proveedores.length === 0) return null;
  return [...proveedores].sort((a, b) => b.n_compras - a.n_compras)[0];
}

/**
 * Se construye defensivamente (`?? []` en cada colección) porque este
 * material se prueba contra ~1,400 registros reales por responsable — un
 * solo registro con un campo en una forma inesperada (null en vez de array,
 * por ejemplo) no debe tumbar el render de todo el panorama.
 */
export function buildMaterialPanorama(record: ConsolidadoProductoRecord, now = Date.now()): MaterialPanorama {
  const items = record.items ?? [];
  const fechasConCantidad = items
    .map((i) => ({ fecha: i.fecha, ms: i.fecha ? new Date(i.fecha).getTime() : NaN, cantidad: i.cantidad ?? 0 }))
    .filter((f) => Boolean(f.fecha) && !Number.isNaN(f.ms))
    .sort((a, b) => a.ms - b.ms);

  const primeraSolicitud = fechasConCantidad[0]?.fecha ?? null;
  const ultimaSolicitud = fechasConCantidad[fechasConCantidad.length - 1]?.fecha ?? null;
  const diasSinMovimiento = ultimaSolicitud ? Math.floor((now - fechasConCantidad[fechasConCantidad.length - 1].ms) / 86_400_000) : null;

  const gaps: number[] = [];
  for (let i = 1; i < fechasConCantidad.length; i += 1) gaps.push((fechasConCantidad[i].ms - fechasConCantidad[i - 1].ms) / 86_400_000);
  const frecuenciaPromedioDias = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;

  const cantidadTotal = record.cantidad_demandada ?? 0;
  const estacionalidad = buildEstacionalidad(fechasConCantidad.map((f) => ({ ms: f.ms, cantidad: f.cantidad })));
  const nivel = classifyPanorama(record.n_reqs ?? 0, estacionalidad.esEstacional);

  const proveedorPrincipal = pickProveedorPrincipal(record);
  const consumoMensualEstimado = cantidadTotal / mesesDeActividad(primeraSolicitud, ultimaSolicitud);

  const coberturaObjetivoMeses = COBERTURA_MESES[nivel];
  const cantidadRecomendada = coberturaObjetivoMeses !== null ? consumoMensualEstimado * coberturaObjetivoMeses : null;

  return {
    codigo: record.codigo_producto,
    producto: record.producto,
    familia: record.familia,
    unidadMedida: record.um,
    vecesSolicitado: record.n_reqs ?? 0,
    cantidadTotal: cantidadTotal,
    cantidadPorComprar: record.cantidad_a_comprar ?? 0,
    reqPendientes: record.n_pendientes ?? 0,
    reqNumeros: record.req_nros ?? [],
    primeraSolicitud,
    ultimaSolicitud,
    frecuenciaPromedioDias,
    diasSinMovimiento,
    consumoMensualEstimado,
    proveedorPrincipal: proveedorPrincipal?.proveedor ?? null,
    ultimaOC: proveedorPrincipal?.ultima_oc && proveedorPrincipal.ultima_oc !== 'nan' ? proveedorPrincipal.ultima_oc : null,
    precioReferencia: proveedorPrincipal?.ultimo_precio ?? null,
    monedaReferencia: proveedorPrincipal?.moneda ?? null,
    valorEstimado: proveedorPrincipal?.ultimo_precio != null ? cantidadTotal * proveedorPrincipal.ultimo_precio : null,
    nivel,
    consumoPorMes: estacionalidad.consumoPorMes,
    mesMayorConsumo: estacionalidad.mesMayorConsumo,
    variacionConsumoPct: estacionalidad.variacionConsumoPct,
    coberturaObjetivoMeses,
    cantidadRecomendada,
    recomendacion: buildRecomendacion(nivel, record.n_pendientes ?? 0),
  };
}

export function buildPanorama(records: ConsolidadoProductoRecord[]): MaterialPanorama[] {
  return records.map((r) => buildMaterialPanorama(r)).sort((a, b) => b.vecesSolicitado - a.vecesSolicitado);
}

export function applyPanoramaFilters(materiales: MaterialPanorama[], filters: PanoramaFilters): MaterialPanorama[] {
  const term = filters.search?.trim().toLowerCase();
  return materiales.filter((m) => {
    if (filters.familia && m.familia !== filters.familia) return false;
    if (filters.categorias && filters.categorias.length > 0 && !filters.categorias.includes(m.nivel)) return false;
    if (filters.soloParaComprar && m.recomendacion === 'NO ABASTECER') return false;
    if (term) {
      const haystack = `${m.codigo} ${m.producto}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export interface PanoramaKpis {
  total: number;
  alta: number;
  media: number;
  estacional: number;
  baja: number;
  paraAbastecer: number;
  reqPendientesTotal: number;
  enRiesgo: number;
}

/** "En riesgo" = alta/media rotación con requerimientos pendientes sin OC — abastecimiento urgente. */
export function buildPanoramaKpis(materiales: MaterialPanorama[]): PanoramaKpis {
  const porNivel = (n: PanoramaNivel) => materiales.filter((m) => m.nivel === n).length;
  return {
    total: materiales.length,
    alta: porNivel('alta'),
    media: porNivel('media'),
    estacional: porNivel('estacional'),
    baja: porNivel('baja'),
    paraAbastecer: materiales.filter((m) => m.recomendacion === 'COMPRAR AHORA' || m.recomendacion === 'PROGRAMAR').length,
    reqPendientesTotal: materiales.reduce((acc, m) => acc + m.reqPendientes, 0),
    enRiesgo: materiales.filter((m) => (m.nivel === 'alta' || m.nivel === 'media') && m.reqPendientes > 0).length,
  };
}
