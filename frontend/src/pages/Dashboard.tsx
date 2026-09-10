import { useProductosContext } from '@/context/ProductosContext';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { KPICard } from '@/components/dashboard/KPICard';
import { ProductosFilters } from '@/components/dashboard/ProductosFilters';
import { Charts } from '@/components/dashboard/Charts';

export function Dashboard() {
  const { kpis, charts, totales, error, loading, refetch } = useProductosContext();

  if (error && !totales) return <ErrorState message={error} onRetry={refetch} />;
  if (!totales && loading) return <LoadingState message="Cargando indicadores..." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KPICard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <ProductosFilters />

      <Charts charts={charts} />
    </div>
  );
}
