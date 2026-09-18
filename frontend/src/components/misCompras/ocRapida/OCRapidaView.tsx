import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { usePlanCompras } from '@/hooks/usePlanCompras';
import { buildPlanPorProveedor, soloConNecesidadDeCompra } from '@/utils/planComprasCalculations';
import { CargaProgresoBanner } from '@/components/rotacion/CargaProgresoBanner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { formatNumber, truncateText } from '@/utils/formatters';

/**
 * Vista rápida y directa: "¿Qué OC tengo que generar?" — sin filtros, sin
 * KPIs, sin gráficos. Solo la lista accionable, agrupada por proveedor, de
 * los últimos 3 meses. Es la versión resumida de "Plan de Compras (2 meses)"
 * para cuando lo único que hace falta es la respuesta rápida.
 */
export function OCRapidaView({ responsable }: { responsable: string | null }) {
  const { materiales: catalogo, loading, progress, error, lastUpdated, refresh } = usePlanCompras(responsable, 'ultimos-3-meses');

  if (error && lastUpdated === null) return <ErrorState message={error} onRetry={refresh} />;

  if (loading) {
    return (
      <CargaProgresoBanner
        progress={progress ? { paginaActual: progress.paginaActual, totalPaginas: progress.totalPaginas, totalUnidades: progress.materialesTotales } : null}
        titulo="Armando tu lista de OC a generar…"
        descripcion="Analizando tus requerimientos de los últimos 3 meses."
        unidadLabel="materiales"
      />
    );
  }

  const proveedores = buildPlanPorProveedor(soloConNecesidadDeCompra(catalogo));

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-100 bg-brand-50/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <ClipboardCheck size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-900">¿Qué OC tengo que generar?</p>
            <p className="text-xs text-brand-700/80">Últimos 3 meses · {formatNumber(proveedores.length)} OC recomendadas</p>
          </div>
        </div>
        <button type="button" onClick={refresh} className="btn-secondary">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {error && lastUpdated !== null && (
        <div className="card border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">⚠️ {error}</div>
      )}

      {proveedores.length === 0 ? (
        <EmptyState title="No tienes materiales pendientes de comprar en los últimos 3 meses" />
      ) : (
        proveedores.map((p, idx) => (
          <div key={p.proveedor} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                OC {idx + 1}: {p.proveedor}
              </p>
              <span className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                {formatNumber(p.nCodigos)} materiales · {formatNumber(p.cantidadTotalUnidades, 1)} unidades
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="bg-white text-left text-xs uppercase text-slate-400">
                    <th className="px-4 py-2">Código</th>
                    <th className="px-4 py-2">Producto</th>
                    <th className="px-4 py-2">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {p.materiales.map((m) => (
                    <tr key={m.codigo} className="border-t border-slate-50">
                      <td className="px-4 py-1.5 text-slate-700">{m.codigo}</td>
                      <td className="px-4 py-1.5 text-slate-600" title={m.producto}>
                        {truncateText(m.producto, 60)}
                      </td>
                      <td className="px-4 py-1.5 font-medium text-slate-700">
                        {formatNumber(m.cantidadPendienteTotal, 1)} {m.unidadMedida ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
