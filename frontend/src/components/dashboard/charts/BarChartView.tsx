import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartConfig } from '@/types/dashboard';
import { colorAt } from '@/utils/chartTheme';
import { formatChartValue } from './chartFormat';

export function BarChartView({ chart }: { chart: ChartConfig }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chart.data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey={chart.nameKey}
          tick={{ fontSize: 11, fill: '#64748b' }}
          angle={-20}
          textAnchor="end"
          height={56}
          interval={0}
        />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
        <Tooltip
          cursor={{ fill: '#f1f5f9' }}
          formatter={(value: number) => formatChartValue(value, chart.valueFormat)}
          contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
        />
        <Bar dataKey="value" name={chart.series[0]?.label ?? 'Valor'} fill={colorAt(0)} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
