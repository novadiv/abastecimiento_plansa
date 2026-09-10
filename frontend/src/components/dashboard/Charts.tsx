import type { ChartConfig } from '@/types/dashboard';
import { ChartCard } from './charts/ChartCard';
import { BarChartView } from './charts/BarChartView';
import { LineChartView } from './charts/LineChartView';
import { PieChartView } from './charts/PieChartView';
import { AreaChartView } from './charts/AreaChartView';
import { EmptyState } from '@/components/common/EmptyState';

const RENDERERS: Record<ChartConfig['kind'], (chart: ChartConfig) => JSX.Element> = {
  bar: (chart) => <BarChartView chart={chart} />,
  line: (chart) => <LineChartView chart={chart} />,
  pie: (chart) => <PieChartView chart={chart} />,
  area: (chart) => <AreaChartView chart={chart} />,
};

export function Charts({ charts }: { charts: ChartConfig[] }) {
  if (charts.length === 0) {
    return (
      <EmptyState title="Sin gráficos disponibles" description="No se encontraron columnas adecuadas para generar visualizaciones con los filtros actuales." />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {charts.map((chart) => (
        <ChartCard key={chart.id} title={chart.title} subtitle={chart.subtitle}>
          {RENDERERS[chart.kind](chart)}
        </ChartCard>
      ))}
    </div>
  );
}
