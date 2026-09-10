import { useState } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { ChartConfig } from '@/types/dashboard';
import { colorAt } from '@/utils/chartTheme';
import { formatChartValue } from './chartFormat';

export function PieChartView({ chart }: { chart: ChartConfig }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visibleData = chart.data.filter((d) => !hidden.has(String(d[chart.nameKey])));
  const colorByName = new Map(chart.data.map((d, i) => [String(d[chart.nameKey]), colorAt(i)]));

  function toggle(name: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={visibleData}
          dataKey="value"
          nameKey={chart.nameKey}
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
        >
          {visibleData.map((entry) => {
            const name = String(entry[chart.nameKey]);
            return <Cell key={name} fill={colorByName.get(name)} />;
          })}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatChartValue(value, chart.valueFormat)}
          contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          onClick={(entry) => toggle(String(entry.value))}
          formatter={(value) => (
            <span className={`text-xs ${hidden.has(String(value)) ? 'text-slate-300 line-through' : 'text-slate-600'}`}>
              {value}
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
