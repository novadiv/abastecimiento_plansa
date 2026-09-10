import { useRotacionContext } from '@/context/RotacionContext';
import { Charts } from '@/components/dashboard/Charts';

/** Reutiliza el sistema genérico de gráficos del dashboard (ChartConfig + Charts) para no duplicar renderers. */
export function RotacionCharts() {
  const { charts } = useRotacionContext();
  return <Charts charts={charts} />;
}
