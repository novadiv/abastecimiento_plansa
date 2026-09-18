import { RefreshCw, ClipboardList } from 'lucide-react';
import { PlanComprasProvider, usePlanComprasContext, type AnioFiltro } from '@/context/PlanComprasContext';
import { CargaProgresoBanner } from '@/components/rotacion/CargaProgresoBanner';
import { ErrorState } from '@/components/common/ErrorState';
import { PlanComprasFiltroBar } from './PlanComprasFiltroBar';
import { PlanComprasResumenEjecutivo } from './PlanComprasResumenEjecutivo';
import { MaterialesRepetidosTable } from './MaterialesRepetidosTable';
import { PlanPorProveedorSection } from './PlanPorProveedorSection';
import { RequerimientosParaPlanificarTable } from './RequerimientosParaPlanificarTable';
import { formatDateTime } from '@/utils/formatters';

function SelectorAnio() {
  const { anioSeleccionado, setAnio, aniosDisponibles } = usePlanComprasContext();
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-brand-700">Periodo:</label>
      <select
        value={anioSeleccionado}
        onChange={(e) => {
          const v = e.target.value;
          setAnio((v === 'todos' || v === 'ultimos-3-meses' ? v : Number(v)) as AnioFiltro);
        }}
        className="input !w-auto !py-1.5 text-xs"
      >
        <option value="ultimos-3-meses">Últimos 3 meses</option>
        {aniosDisponibles.map((a) => (
          <option key={a} value={a}>
            Año {a}
          </option>
        ))}
        <option value="todos">Todos los años</option>
      </select>
    </div>
  );
}

function PlanComprasContent() {
  const { loading, progress, error, lastUpdated, refresh } = usePlanComprasContext();

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-100 bg-brand-50/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <ClipboardList size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-900">Plan de Compras y Consolidación (2 meses)</p>
            <p className="text-xs text-brand-700/80">
              {lastUpdated ? `Calculado ${formatDateTime(lastUpdated)} · ` : ''}cruza tus requerimientos con el estado real de OC
              (`tiene_oc`/`saldo_pendiente`) — no existe una colección separada de OC con campo de comprador, así que la conciliación se hace a
              nivel de requerimiento↔OC.
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
          titulo="Cruzando tus requerimientos con las OC existentes…"
          descripcion="Analizando tu historial para armar el plan de compras consolidado de los próximos 2 meses."
          unidadLabel="materiales"
        />
      )}

      {!loading && lastUpdated !== null && (
        <>
          <PlanComprasResumenEjecutivo />
          <PlanComprasFiltroBar />
          <PlanPorProveedorSection />
          <MaterialesRepetidosTable />
          <RequerimientosParaPlanificarTable />
        </>
      )}
    </div>
  );
}

export function PlanComprasCompleto({ responsable }: { responsable: string | null }) {
  return (
    <PlanComprasProvider responsable={responsable}>
      <PlanComprasContent />
    </PlanComprasProvider>
  );
}
