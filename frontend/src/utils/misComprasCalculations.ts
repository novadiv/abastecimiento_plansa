import type { KPIDefinition } from '@/types/dashboard';
import type { ConsolidadoProductoKpis, RequerimientosKpis, StatsOC } from '@/types/requerimiento';
import { formatCompactCurrency, formatNumber, formatPercent } from './formatters';

/**
 * KPIs de "Mis Compras". Se combinan tres fuentes, todas ya filtradas por
 * `responsable` en el servidor: `/requerimientos/kpis`, `/requerimientos/stats-oc`
 * y el bloque `kpis` de `/requerimientos/consolidado-producto`. El único
 * valor derivado en el cliente es un promedio (división simple de dos
 * totales reales), nunca un dato inventado.
 */
export function buildMisComprasKpis(
  kpis: RequerimientosKpis | null,
  statsOC: StatsOC | null,
  consolidadoKpis: ConsolidadoProductoKpis | null,
  kpisMesActual: RequerimientosKpis | null,
  kpisAñoActual: RequerimientosKpis | null,
): KPIDefinition[] {
  const result: KPIDefinition[] = [];

  if (consolidadoKpis) {
    result.push({
      id: 'productos-distintos',
      label: 'Productos / items comprados',
      value: formatNumber(consolidadoKpis.total_productos),
      rawValue: consolidadoKpis.total_productos,
      available: true,
      icon: 'package',
      accent: 'brand',
      helpText: 'Cantidad de productos distintos en tu historial de requerimientos, según los filtros aplicados.',
    });
  }

  if (statsOC) {
    result.push(
      {
        id: 'requerimientos-con-oc',
        label: 'Requerimientos con OC asociada',
        value: formatNumber(statsOC.con_oc),
        rawValue: statsOC.con_oc,
        available: true,
        icon: 'shopping-cart',
        accent: 'emerald',
        helpText: `${formatNumber(statsOC.sin_oc)} requerimientos todavía sin OC asociada.`,
      },
      {
        id: 'valor-comprado',
        label: 'Valor comprado (con OC)',
        value: formatCompactCurrency(statsOC.valor_con_oc, 'PEN'),
        rawValue: statsOC.valor_con_oc,
        available: true,
        icon: 'dollar-sign',
        accent: 'brand',
        helpText: 'Valorización de los requerimientos que ya tienen una Orden de Compra asociada.',
      },
      {
        id: 'promedio-por-oc',
        label: 'Promedio por requerimiento con OC',
        value: statsOC.con_oc > 0 ? formatCompactCurrency(statsOC.valor_con_oc / statsOC.con_oc, 'PEN') : 'No disponible',
        rawValue: statsOC.con_oc > 0 ? statsOC.valor_con_oc / statsOC.con_oc : null,
        available: statsOC.con_oc > 0,
        icon: 'gauge',
        accent: 'slate',
        helpText: 'Valor comprado (con OC) dividido entre la cantidad de requerimientos con OC.',
      },
    );
  }

  if (kpisMesActual) {
    result.push({
      id: 'requerimientos-mes',
      label: 'Requerimientos este mes',
      value: formatNumber(kpisMesActual.total_requerimientos),
      rawValue: kpisMesActual.total_requerimientos,
      available: true,
      icon: 'trending-up',
      accent: 'amber',
      helpText: 'No depende de los filtros seleccionados abajo — siempre es el mes calendario actual.',
    });
  }

  if (kpisAñoActual) {
    result.push({
      id: 'requerimientos-anio',
      label: 'Requerimientos este año',
      value: formatNumber(kpisAñoActual.total_requerimientos),
      rawValue: kpisAñoActual.total_requerimientos,
      available: true,
      icon: 'trending-up',
      accent: 'amber',
      helpText: 'No depende de los filtros seleccionados abajo — siempre es el año calendario actual.',
    });
  }

  if (kpis) {
    result.push({
      id: 'tasa-atencion',
      label: 'Tasa de atención',
      value: formatPercent(kpis.tasa_atencion),
      rawValue: kpis.tasa_atencion,
      available: true,
      icon: 'check-circle',
      accent: 'emerald',
      helpText: `${formatNumber(kpis.atendidos)} de ${formatNumber(kpis.total_requerimientos)} requerimientos atendidos (según los filtros aplicados).`,
    });
  }

  return result;
}
