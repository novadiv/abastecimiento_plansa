import { useMisComprasContext } from '@/context/MisComprasContext';
import { KPICard } from '@/components/dashboard/KPICard';
import { buildMisComprasKpis } from '@/utils/misComprasCalculations';

export function MisComprasKPIs() {
  const { data, kpisMesActual, kpisAñoActual } = useMisComprasContext();
  const kpis = buildMisComprasKpis(data.kpis, data.statsOC, data.consolidado.kpis, kpisMesActual, kpisAñoActual);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <KPICard key={kpi.id} kpi={kpi} />
      ))}
    </div>
  );
}
