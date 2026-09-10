import type { AnalysisBlock, AnalysisInsight, ChartConfig, ChartDatum, KPIDefinition } from '@/types/dashboard';
import type { CatalogoOpcion, DashboardKpis, ProductosTotales } from '@/types/producto';
import { formatCompactCurrency, formatCompactNumber, formatNumber, formatPercent } from './formatters';

/**
 * Construye KPIs, gráficos e insights a partir de los agregados que ya
 * calcula el servidor (`totales` de /api/productos y /api/dashboard/kpis),
 * en vez de recomputarlos sobre miles de filas en el navegador.
 */

const OTHERS_LABEL = 'Otros';

function sumOthers(items: CatalogoOpcion[], from: number): number {
  return items.slice(from).reduce((acc, item) => acc + item.cantidad, 0);
}

function topCategories(items: CatalogoOpcion[], max: number): { name: string; value: number }[] {
  const sorted = [...items].sort((a, b) => b.cantidad - a.cantidad);
  if (sorted.length <= max) return sorted.map((i) => ({ name: i.nombre, value: i.cantidad }));
  const top = sorted.slice(0, max - 1).map((i) => ({ name: i.nombre, value: i.cantidad }));
  return [...top, { name: OTHERS_LABEL, value: sumOthers(sorted, max - 1) }];
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export function buildKpiCards(
  totales: ProductosTotales | null,
  dashboardKpis: DashboardKpis | null,
  filteredTotal: number,
): KPIDefinition[] {
  const kpis: KPIDefinition[] = [
    {
      id: 'productos-filtrados',
      label: 'Productos (según filtros)',
      value: formatNumber(filteredTotal),
      rawValue: filteredTotal,
      available: true,
      icon: 'database',
      accent: 'brand',
      helpText: 'Cantidad de productos que cumplen los filtros aplicados.',
    },
  ];

  if (totales) {
    kpis.push(
      {
        id: 'stock-valorizado',
        label: 'Stock valorizado (USD)',
        value: formatCompactCurrency(totales.stock_valorizado_usd),
        rawValue: totales.stock_valorizado_usd,
        available: true,
        icon: 'dollar-sign',
        accent: 'brand',
        helpText: 'Valor del stock actual de los productos filtrados.',
      },
      {
        id: 'compra-sugerida-usd',
        label: 'Compra sugerida (USD)',
        value: formatCompactCurrency(totales.compra_sugerida_usd),
        rawValue: totales.compra_sugerida_usd,
        available: true,
        icon: 'shopping-cart',
        accent: 'amber',
        helpText: 'Suma del valor de compra sugerido para los productos filtrados.',
      },
      {
        id: 'por-llegar-usd',
        label: 'Por llegar (USD)',
        value: formatCompactCurrency(totales.on_order_valorizado_usd),
        rawValue: totales.on_order_valorizado_usd,
        available: true,
        icon: 'trending-up',
        accent: 'slate',
        helpText: `${formatNumber(totales.on_order_items)} órdenes de compra en tránsito.`,
      },
      {
        id: 'valor-mensual-usd',
        label: 'Valor mensual (USD)',
        value: formatCompactCurrency(totales.valor_mensual_usd),
        rawValue: totales.valor_mensual_usd,
        available: true,
        icon: 'gauge',
        accent: 'slate',
        helpText: 'Valorización mensual de consumo de los productos filtrados.',
      },
    );
  }

  if (dashboardKpis) {
    kpis.push(
      {
        id: 'ordenes-pendientes',
        label: 'Órdenes pendientes',
        value: formatNumber(dashboardKpis.ordenes_pendientes),
        rawValue: dashboardKpis.ordenes_pendientes,
        available: true,
        icon: 'package',
        accent: 'amber',
        helpText: 'Global del sistema — no varía con los filtros de esta tabla.',
      },
      {
        id: 'requerimientos-pendientes',
        label: 'Requerimientos pendientes',
        value: formatNumber(dashboardKpis.requerimientos_pendientes),
        rawValue: dashboardKpis.requerimientos_pendientes,
        available: true,
        icon: 'alert-triangle',
        accent: 'rose',
        helpText: 'Global del sistema — no varía con los filtros de esta tabla.',
      },
    );
  }

  return kpis;
}

// ---------------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------------

export function buildCharts(totales: ProductosTotales | null, familias: CatalogoOpcion[]): ChartConfig[] {
  const charts: ChartConfig[] = [];

  if (familias.length > 0) {
    charts.push({
      id: 'chart-bar-familias',
      kind: 'bar',
      title: 'Productos por Familia',
      subtitle: 'Cantidad de productos del catálogo agrupados por familia (global, no depende de los filtros)',
      data: topCategories(familias, 8) as ChartDatum[],
      series: [{ key: 'value', label: 'Productos' }],
      nameKey: 'name',
      valueFormat: 'number',
    });

    const sorted = [...familias].sort((a, b) => b.cantidad - a.cantidad);
    const total = sorted.reduce((acc, f) => acc + f.cantidad, 0);
    if (total > 0) {
      let cumulative = 0;
      const data: ChartDatum[] = sorted.map((f, idx) => {
        cumulative += f.cantidad;
        return {
          name: `${formatPercent(((idx + 1) / sorted.length) * 100, 0)}`,
          value: Number(((cumulative / total) * 100).toFixed(1)),
        };
      });
      charts.push({
        id: 'chart-area-concentracion',
        kind: 'area',
        title: 'Concentración del catálogo por familia',
        subtitle: '% acumulado de productos según el % de familias incluidas (ordenadas de mayor a menor)',
        data,
        series: [{ key: 'value', label: '% acumulado' }],
        nameKey: 'name',
        valueFormat: 'percent',
      });
    }
  }

  if (totales) {
    charts.push({
      id: 'chart-line-consumo',
      kind: 'line',
      title: 'Consumo por horizonte de tiempo',
      subtitle: 'Consumo mensual promedio según distintas ventanas (productos filtrados)',
      data: [
        { name: 'Últimos 3 meses', value: totales.consumo_3m_mensual },
        { name: 'Últimos 6 meses', value: totales.consumo_6m_mensual },
        { name: 'Promedio 12 meses', value: totales.consumo_prom_mensual },
        { name: 'P95 (12 meses)', value: totales.consumo_p95_mensual },
      ],
      series: [{ key: 'value', label: 'Consumo mensual' }],
      nameKey: 'name',
      valueFormat: 'number',
    });

    const conf = totales.confiabilidad;
    const confData: ChartDatum[] = [
      { name: 'Confiable', value: conf.confiable },
      { name: 'Revisión', value: conf.revision },
      { name: 'Precaución', value: conf.precaucion },
      { name: 'No confiable', value: conf.no_confiable },
    ].filter((d) => (d.value as number) > 0);

    if (confData.length > 0) {
      charts.push({
        id: 'chart-pie-confiabilidad',
        kind: 'pie',
        title: 'Confiabilidad del precio',
        subtitle: 'Distribución de productos filtrados según la confiabilidad de su precio de compra',
        data: confData,
        series: [{ key: 'value', label: 'Productos' }],
        nameKey: 'name',
        valueFormat: 'number',
      });
    }
  }

  return charts;
}

// ---------------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------------

export function buildAnalysisInsights(
  totales: ProductosTotales | null,
  familias: CatalogoOpcion[],
  filteredTotal: number,
): AnalysisInsight[] {
  const insights: AnalysisInsight[] = [];

  if (familias.length > 0) {
    const sorted = [...familias].sort((a, b) => b.cantidad - a.cantidad);
    const totalCatalogo = sorted.reduce((acc, f) => acc + f.cantidad, 0);
    const [leader] = sorted;
    if (leader && totalCatalogo > 0) {
      insights.push({
        id: 'top-familia',
        tone: 'neutral',
        text: `"${leader.nombre}" es la familia con más productos en el catálogo, representando el ${formatPercent((leader.cantidad / totalCatalogo) * 100)} del total.`,
      });
    }

    const top20pct = Math.max(1, Math.round(sorted.length * 0.2));
    const top20Sum = sorted.slice(0, top20pct).reduce((acc, f) => acc + f.cantidad, 0);
    if (totalCatalogo > 0) {
      insights.push({
        id: 'pareto-familias',
        tone: 'positive',
        text: `El ${formatPercent((top20pct / sorted.length) * 100, 0)} de las familias con más productos concentra el ${formatPercent((top20Sum / totalCatalogo) * 100)} del catálogo.`,
      });
    }
  }

  if (totales) {
    const conf = totales.confiabilidad;
    const confTotal = conf.confiable + conf.revision + conf.precaucion + conf.no_confiable;
    if (confTotal > 0) {
      const problemPct = ((conf.revision + conf.no_confiable) / confTotal) * 100;
      insights.push({
        id: 'confiabilidad-precio',
        tone: problemPct > 30 ? 'warning' : 'neutral',
        text: `${formatPercent(problemPct)} de los productos filtrados tienen un precio en revisión o no confiable — conviene priorizar su verificación.`,
      });
    }

    if (totales.on_order_items > 0) {
      insights.push({
        id: 'por-llegar',
        tone: 'neutral',
        text: `Hay ${formatNumber(totales.on_order_items)} órdenes de compra en tránsito, por un valor de ${formatCompactCurrency(totales.on_order_valorizado_usd)}.`,
      });
    }
  }

  insights.push({
    id: 'total-filtrado',
    tone: 'neutral',
    text: `Los filtros actuales muestran ${formatNumber(filteredTotal)} productos.`,
  });

  return insights;
}

export function buildAnalysisBlocks(totales: ProductosTotales | null): AnalysisBlock[] {
  if (!totales) return [];

  return [
    {
      id: 'valorizacion',
      title: 'Valorización (productos filtrados)',
      subtitle: 'Montos calculados por el servidor sobre el conjunto filtrado actual',
      rows: [
        { label: 'Stock valorizado (USD)', value: formatCompactCurrency(totales.stock_valorizado_usd) },
        { label: 'Por llegar (USD)', value: formatCompactCurrency(totales.on_order_valorizado_usd) },
        { label: 'Por llegar (PEN)', value: formatCompactCurrency(totales.on_order_valorizado_pen, 'PEN') },
        { label: 'Stock + por llegar (USD)', value: formatCompactCurrency(totales.valorizado_con_por_llegar_usd) },
        { label: 'Compra sugerida (USD)', value: formatCompactCurrency(totales.compra_sugerida_usd) },
        { label: 'Compra sugerida (PEN)', value: formatCompactCurrency(totales.compra_sugerida_pen, 'PEN') },
      ],
    },
    {
      id: 'consumo',
      title: 'Consumo mensual',
      subtitle: 'Promedios de consumo mensual según distintas ventanas de tiempo',
      rows: [
        { label: 'Últimos 3 meses', value: formatCompactNumber(totales.consumo_3m_mensual) },
        { label: 'Últimos 6 meses', value: formatCompactNumber(totales.consumo_6m_mensual) },
        { label: 'Promedio 12 meses', value: formatCompactNumber(totales.consumo_prom_mensual) },
        { label: 'P95 (12 meses)', value: formatCompactNumber(totales.consumo_p95_mensual) },
      ],
    },
    {
      id: 'confiabilidad',
      title: 'Confiabilidad de precio',
      subtitle: 'Cantidad de productos filtrados en cada nivel de confiabilidad',
      rows: [
        { label: 'Confiable', value: formatNumber(totales.confiabilidad.confiable) },
        { label: 'En revisión', value: formatNumber(totales.confiabilidad.revision) },
        { label: 'Con precaución', value: formatNumber(totales.confiabilidad.precaucion) },
        { label: 'No confiable', value: formatNumber(totales.confiabilidad.no_confiable) },
      ],
    },
  ];
}
