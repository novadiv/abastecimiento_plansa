import type { ChartConfig } from '@/types/dashboard';
import { formatCompactNumber, formatNumber, formatPercent } from '@/utils/formatters';

export function formatChartValue(value: number, format: ChartConfig['valueFormat']): string {
  if (format === 'percent') return formatPercent(value);
  if (format === 'currency') return formatCompactNumber(value);
  return formatNumber(value);
}
