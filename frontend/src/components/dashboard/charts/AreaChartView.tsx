import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartConfig } from '@/types/dashboard';
import { colorAt } from '@/utils/chartTheme';
import { formatChartValue } from './chartFormat';

export function AreaChartView({ chart }: { chart: ChartConfig }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chart.data} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colorAt(0)} stopOpacity={0.35} />
            <stop offset="95%" stopColor={colorAt(0)} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey={chart.nameKey} tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
        <Tooltip
          formatter={(value: number) => formatChartValue(value, chart.valueFormat)}
          contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
        />
        <Area
          type="monotone"
          dataKey="value"
          name={chart.series[0]?.label ?? 'Valor'}
          stroke={colorAt(0)}
          strokeWidth={2.5}
          fill="url(#areaFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
