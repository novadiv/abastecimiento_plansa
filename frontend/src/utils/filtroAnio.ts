import type { ConsolidadoProductoRecord, RequerimientoItem } from '@/types/requerimiento';

/**
 * El parámetro `año` de `/requerimientos/consolidado-producto` NO filtra nada
 * (verificado: con o sin año, el total devuelto es idéntico) — a diferencia
 * de `/requerimientos/kpis`, que sí lo respeta. Por eso el filtro de periodo
 * se aplica aquí, en el cliente, sobre los `items[]` reales de cada material
 * (que sí traen `fecha`) — y de paso evita repetir la descarga completa cada
 * vez que el usuario cambia de periodo.
 */

/** 'todos' = sin filtro; un año exacto (número); o una ventana móvil de los últimos N meses desde hoy. */
export type PeriodoFiltro = 'todos' | number | 'ultimos-3-meses';

function cumpleFecha(item: RequerimientoItem, periodo: Exclude<PeriodoFiltro, 'todos'>, ahora: number): boolean {
  if (!item.fecha) return false;
  const fechaMs = new Date(item.fecha).getTime();
  if (Number.isNaN(fechaMs)) return false;

  if (periodo === 'ultimos-3-meses') {
    const corte = new Date(ahora);
    corte.setMonth(corte.getMonth() - 3);
    return fechaMs >= corte.getTime();
  }
  return new Date(item.fecha).getFullYear() === periodo;
}

export function filtrarRecordsPorPeriodo(
  records: ConsolidadoProductoRecord[],
  periodo: PeriodoFiltro | undefined,
  ahora = Date.now(),
): ConsolidadoProductoRecord[] {
  if (periodo === undefined || periodo === 'todos') return records;

  const resultado: ConsolidadoProductoRecord[] = [];

  records.forEach((r) => {
    const items = (r.items ?? []).filter((i) => cumpleFecha(i, periodo, ahora));
    if (items.length === 0) return;

    const nAtendidos = items.filter((i) => i.tiene_oc && (i.saldo_pendiente ?? 0) <= 0).length;
    const nPendientes = items.filter((i) => !i.tiene_oc && (i.saldo_pendiente ?? 0) > 0).length;
    const nEnProceso = items.length - nAtendidos - nPendientes;
    const sum = (values: (number | null)[]) => values.reduce((a: number, b) => a + (b ?? 0), 0);

    resultado.push({
      ...r,
      items,
      n_reqs: items.length,
      cantidad_demandada: sum(items.map((i) => i.cantidad)),
      cantidad_entregada: sum(items.map((i) => i.cantidad_entregada_real)),
      saldo_total: sum(items.map((i) => i.saldo_pendiente)),
      cantidad_a_comprar: sum(items.map((i) => i.cantidad_a_comprar)),
      n_pendientes: nPendientes,
      n_atendidos: nAtendidos,
      n_en_proceso: nEnProceso,
      req_nros: items.map((i) => i.req_nro),
    });
  });

  return resultado;
}

/** @deprecated usar `filtrarRecordsPorPeriodo` — se mantiene para no romper otros imports existentes. */
export function filtrarRecordsPorAnio(records: ConsolidadoProductoRecord[], anio: number | undefined): ConsolidadoProductoRecord[] {
  return filtrarRecordsPorPeriodo(records, anio);
}
