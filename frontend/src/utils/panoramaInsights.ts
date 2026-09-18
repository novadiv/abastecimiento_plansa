import type { ChartConfig, KPIDefinition } from '@/types/dashboard';
import type { MaterialPanorama, PanoramaNivel } from '@/types/panorama';
import type { PanoramaKpis } from './panoramaCalculations';
import { MES_NOMBRES } from './estacionalidad';
import { formatNumber } from './formatters';

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

const NIVEL_LABEL: Record<PanoramaNivel, string> = {
  alta: '🔴 Alta rotación',
  media: '🟠 Media rotación',
  estacional: '🔵 Estacional',
  baja: '🟢 Baja/poca rotación',
};

export function buildPanoramaKpiCards(kpis: PanoramaKpis): KPIDefinition[] {
  return [
    { id: 'total', label: 'Total de materiales', value: formatNumber(kpis.total), rawValue: kpis.total, available: true, icon: 'database', accent: 'brand' },
    { id: 'alta', label: '🔴 Alta rotación', value: formatNumber(kpis.alta), rawValue: kpis.alta, available: true, icon: 'trending-up', accent: 'rose' },
    { id: 'media', label: '🟠 Media rotación', value: formatNumber(kpis.media), rawValue: kpis.media, available: true, icon: 'gauge', accent: 'amber' },
    { id: 'estacional', label: '🔵 Estacionales', value: formatNumber(kpis.estacional), rawValue: kpis.estacional, available: true, icon: 'trending-up', accent: 'brand' },
    { id: 'baja', label: '🟢 Baja/poca rotación', value: formatNumber(kpis.baja), rawValue: kpis.baja, available: true, icon: 'trending-down', accent: 'emerald' },
    {
      id: 'para-abastecer',
      label: '📦 Recomendados para abastecer',
      value: formatNumber(kpis.paraAbastecer),
      rawValue: kpis.paraAbastecer,
      available: true,
      icon: 'shopping-cart',
      accent: 'brand',
      helpText: 'Materiales con recomendación "Comprar ahora" o "Programar".',
    },
    {
      id: 'en-riesgo',
      label: '⚠️ En riesgo de desabastecimiento',
      value: formatNumber(kpis.enRiesgo),
      rawValue: kpis.enRiesgo,
      available: true,
      icon: 'alert-triangle',
      accent: 'rose',
      helpText: 'Alta/media rotación con requerimientos pendientes sin atender.',
    },
    {
      id: 'req-pendientes',
      label: '📋 REQ pendientes relacionados',
      value: formatNumber(kpis.reqPendientesTotal),
      rawValue: kpis.reqPendientesTotal,
      available: true,
      icon: 'package',
      accent: 'slate',
    },
  ];
}

export function buildPanoramaCharts(materiales: MaterialPanorama[]): ChartConfig[] {
  if (materiales.length === 0) return [];
  const charts: ChartConfig[] = [];

  charts.push({
    id: 'distribucion-clasificacion',
    kind: 'pie',
    title: 'Distribución de materiales por clasificación',
    subtitle: 'Según los filtros/checkboxes aplicados',
    data: (['alta', 'media', 'estacional', 'baja'] as PanoramaNivel[]).map((nivel) => ({
      name: NIVEL_LABEL[nivel],
      value: materiales.filter((m) => m.nivel === nivel).length,
    })),
    series: [{ key: 'value', label: 'Materiales' }],
    nameKey: 'name',
    valueFormat: 'number',
  });

  const masSolicitados = [...materiales].sort((a, b) => b.vecesSolicitado - a.vecesSolicitado).slice(0, 10);
  charts.push({
    id: 'mas-solicitados',
    kind: 'bar',
    title: 'Materiales más solicitados',
    subtitle: 'Por número de veces solicitado',
    data: masSolicitados.map((m) => ({ name: m.codigo, value: m.vecesSolicitado })),
    series: [{ key: 'value', label: 'Veces solicitado' }],
    nameKey: 'name',
    valueFormat: 'number',
  });

  const mayorConsumo = [...materiales].sort((a, b) => b.cantidadTotal - a.cantidadTotal).slice(0, 10);
  charts.push({
    id: 'mayor-consumo',
    kind: 'bar',
    title: 'Materiales con mayor consumo estimado',
    subtitle: 'Cantidad total solicitada (histórico)',
    data: mayorConsumo.map((m) => ({ name: m.codigo, value: m.cantidadTotal })),
    series: [{ key: 'value', label: 'Cantidad total' }],
    nameKey: 'name',
    valueFormat: 'number',
  });

  const evolucionMensual = MES_NOMBRES.map((mes, i) => ({
    name: mes.slice(0, 3),
    value: sum(materiales.map((m) => m.consumoPorMes[i] ?? 0)),
  }));
  charts.push({
    id: 'evolucion-mensual',
    kind: 'bar',
    title: 'Evolución de solicitudes por mes',
    subtitle: 'Cantidad solicitada por mes calendario, todo el historial agregado',
    data: evolucionMensual,
    series: [{ key: 'value', label: 'Cantidad' }],
    nameKey: 'name',
    valueFormat: 'number',
  });

  const estacionales = materiales.filter((m) => m.nivel === 'estacional');
  if (estacionales.length > 0) {
    const consumoEstacional = MES_NOMBRES.map((mes, i) => ({
      name: mes.slice(0, 3),
      value: sum(estacionales.map((m) => m.consumoPorMes[i] ?? 0)),
    }));
    charts.push({
      id: 'comportamiento-estacional',
      kind: 'bar',
      title: 'Comportamiento de los materiales estacionales',
      subtitle: `Solo entre los ${formatNumber(estacionales.length)} materiales clasificados como estacionales`,
      data: consumoEstacional,
      series: [{ key: 'value', label: 'Cantidad' }],
      nameKey: 'name',
      valueFormat: 'number',
    });
  }

  const paraDosMeses = materiales.filter((m) => m.nivel === 'alta' && m.cantidadRecomendada !== null).sort((a, b) => (b.cantidadRecomendada ?? 0) - (a.cantidadRecomendada ?? 0)).slice(0, 10);
  if (paraDosMeses.length > 0) {
    charts.push({
      id: 'plan-2-meses',
      kind: 'bar',
      title: 'Materiales que requieren compra para los próximos 2 meses',
      subtitle: 'Top 10 por cantidad recomendada (alta rotación)',
      data: paraDosMeses.map((m) => ({ name: m.codigo, value: m.cantidadRecomendada ?? 0 })),
      series: [{ key: 'value', label: 'Cantidad recomendada' }],
      nameKey: 'name',
      valueFormat: 'number',
    });
  }

  return charts;
}
