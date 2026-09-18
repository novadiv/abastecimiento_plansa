import { RefreshCw, LayoutGrid } from 'lucide-react';
import { PanoramaProvider, usePanoramaContext, type AnioFiltro } from '@/context/PanoramaContext';
import { CargaProgresoBanner } from '@/components/rotacion/CargaProgresoBanner';
import { ErrorState } from '@/components/common/ErrorState';
import { KPICard } from '@/components/dashboard/KPICard';
import { Charts } from '@/components/dashboard/Charts';
import { PanoramaCategoriaFiltroBar } from './PanoramaCategoriaFiltroBar';
import { PanoramaTable } from './PanoramaTable';
import { PanoramaDetalleModal } from './PanoramaDetalleModal';
import { formatDateTime } from '@/utils/formatters';

function SelectorAnio() {
  const { anioSeleccionado, setAnio, aniosDisponibles } = usePanoramaContext();
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-brand-700">Año:</label>
      <select
        value={anioSeleccionado}
        onChange={(e) => setAnio((e.target.value === 'todos' ? 'todos' : Number(e.target.value)) as AnioFiltro)}
        className="input !w-auto !py-1.5 text-xs"
      >
        <option value="todos">Todos los años</option>
        {aniosDisponibles.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  );
}

function PanoramaContent() {
  const { loading, progress, error, lastUpdated, refresh, kpiCards, charts } = usePanoramaContext();

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-100 bg-brand-50/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <LayoutGrid size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-900">Panorama Completo de Materiales</p>
            <p className="text-xs text-brand-700/80">
              {lastUpdated ? `Calculado ${formatDateTime(lastUpdated)} · ` : ''}clasificación Alta/Media/Estacional/Baja
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SelectorAnio />
          <button type="button" onClick={refresh} className="btn-secondary">
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      {error && lastUpdated === null && <ErrorState message={error} onRetry={refresh} />}
      {error && lastUpdated !== null && (
        <div className="card border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">⚠️ {error}</div>
      )}

      {loading && (
        <CargaProgresoBanner
          progress={progress ? { paginaActual: progress.paginaActual, totalPaginas: progress.totalPaginas, totalUnidades: progress.materialesTotales } : null}
          titulo="Analizando tu panorama completo de materiales…"
          descripcion="Trayendo tu historial de requerimientos (no solo los más frecuentes) para clasificar correctamente cada material."
          unidadLabel="materiales"
        />
      )}

      {!loading && lastUpdated !== null && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {kpiCards.map((kpi) => (
              <KPICard key={kpi.id} kpi={kpi} />
            ))}
          </div>

          <PanoramaCategoriaFiltroBar />
          <Charts charts={charts} />
          <PanoramaTable />
          <PanoramaDetalleModal />
        </>
      )}
    </div>
  );
}

export function PanoramaCompleto({ responsable }: { responsable: string | null }) {
  return (
    <PanoramaProvider responsable={responsable}>
      <PanoramaContent />
    </PanoramaProvider>
  );
}
