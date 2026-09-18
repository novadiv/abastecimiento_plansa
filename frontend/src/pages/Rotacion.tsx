import { RefreshCw, Repeat } from 'lucide-react';
import { RotacionProvider, useRotacionContext } from '@/context/RotacionContext';
import { CargaProgresoBanner } from '@/components/rotacion/CargaProgresoBanner';
import { RotacionConfigPanel } from '@/components/rotacion/RotacionConfigPanel';
import { CategoriaFiltroBar } from '@/components/rotacion/CategoriaFiltroBar';
import { RotacionFiltersBar } from '@/components/rotacion/RotacionFiltersBar';
import { PanoramaEjecutivo } from '@/components/rotacion/PanoramaEjecutivo';
import { ComparacionCards } from '@/components/rotacion/ComparacionCards';
import { RankingMaterialesTable } from '@/components/rotacion/RankingMaterialesTable';
import { NivelSection } from '@/components/rotacion/NivelSection';
import { AlertasPanel } from '@/components/rotacion/AlertasPanel';
import { MaterialesEstacionalesSection } from '@/components/rotacion/MaterialesEstacionalesSection';
import { RotacionCharts } from '@/components/rotacion/RotacionCharts';
import { MaterialDetalleModal } from '@/components/rotacion/MaterialDetalleModal';
import { KPICard } from '@/components/dashboard/KPICard';
import { ErrorState } from '@/components/common/ErrorState';
import { formatDateTime } from '@/utils/formatters';

function RotacionContent() {
  const { loading, progress, error, lastUpdated, refresh, kpis, comparacionPorNivel, comparacionSuministrosRepuestos } =
    useRotacionContext();

  if (error && lastUpdated === null) return <ErrorState message={error} onRetry={refresh} />;
  if (loading) {
    return (
      <CargaProgresoBanner
        progress={progress ? { ...progress, totalUnidades: progress.materialesTotales } : null}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-100 bg-brand-50/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Repeat size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-900">Análisis de Materiales y Rotación</p>
            <p className="text-xs text-brand-700/80">
              Catálogo cargado {formatDateTime(lastUpdated)} · basado en el historial de Requerimientos (ver README)
            </p>
          </div>
        </div>
        <button type="button" onClick={refresh} className="btn-secondary">
          <RefreshCw size={14} /> Actualizar catálogo
        </button>
      </div>

      <PanoramaEjecutivo />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KPICard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <RotacionConfigPanel />
      <CategoriaFiltroBar />
      <RotacionFiltersBar />

      <ComparacionCards
        titulo="Alta vs Media vs Baja vs Sin rotación"
        subtitulo="Comparación de materiales, movimientos, cantidad y valor por nivel de rotación (según filtros aplicados)"
        grupos={comparacionPorNivel}
      />

      <ComparacionCards
        titulo="Suministros vs Repuestos"
        subtitulo="Comparación entre ambos grupos de materiales (según filtros aplicados)"
        grupos={comparacionSuministrosRepuestos}
      />

      <RankingMaterialesTable />

      <RotacionCharts />

      <AlertasPanel />

      <MaterialesEstacionalesSection />

      <div className="space-y-6">
        <NivelSection nivel="alta" />
        <NivelSection nivel="media" />
        <NivelSection nivel="baja" />
        <NivelSection nivel="sinRotacion" />
      </div>

      <MaterialDetalleModal />
    </div>
  );
}

export function Rotacion() {
  return (
    <RotacionProvider>
      <RotacionContent />
    </RotacionProvider>
  );
}
