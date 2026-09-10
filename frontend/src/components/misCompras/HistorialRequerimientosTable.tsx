import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMisComprasContext } from '@/context/MisComprasContext';
import { formatDate, formatNumber, truncateText } from '@/utils/formatters';
import { Badge } from '@/components/common/Badge';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

export function HistorialRequerimientosTable() {
  const { data } = useMisComprasContext();
  const { historial, setHistorialPage } = data;

  if (historial.loading && historial.items.length === 0) return <LoadingState message="Cargando historial..." />;
  if (historial.error) return <ErrorState message={historial.error} />;
  if (historial.items.length === 0) {
    return <EmptyState title="No hay requerimientos que coincidan con los filtros aplicados" />;
  }

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Historial de mis requerimientos</h3>
        <p className="text-xs text-slate-400">{formatNumber(historial.total)} registros en total</p>
      </div>

      <div className="max-h-[500px] overflow-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5">N° Requerimiento</th>
              <th className="px-3 py-2.5">Fecha</th>
              <th className="px-3 py-2.5">Producto</th>
              <th className="px-3 py-2.5">Código</th>
              <th className="px-3 py-2.5">Cantidad</th>
              <th className="px-3 py-2.5">Saldo pendiente</th>
              <th className="px-3 py-2.5">Área origen</th>
              <th className="px-3 py-2.5">Solicitante</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5">N° OC</th>
            </tr>
          </thead>
          <tbody>
            {historial.items.map((item) => (
              <tr key={item.id_requerimiento} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-700">{item.req_nro}</td>
                <td className="px-3 py-2 text-slate-600">{formatDate(item.fecha)}</td>
                <td className="px-3 py-2 text-slate-600" title={item.producto ?? ''}>
                  {item.producto ? truncateText(item.producto, 44) : '—'}
                </td>
                <td className="px-3 py-2 text-slate-600">{item.codigo_producto ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600">{formatNumber(item.cantidad ?? undefined, 1)}</td>
                <td className="px-3 py-2 text-slate-600">{formatNumber(item.saldo_pendiente ?? undefined, 1)}</td>
                <td className="px-3 py-2 text-slate-600">{item.area_origen ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600" title={item.solicita ?? ''}>
                  {item.solicita ? truncateText(item.solicita, 24) : '—'}
                </td>
                <td className="px-3 py-2">{item.estado_normalizado ? <Badge>{item.estado_normalizado}</Badge> : '—'}</td>
                <td className="px-3 py-2 text-slate-600">{item.tiene_oc && item.nro_oc && item.nro_oc !== 'nan' ? item.nro_oc : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
        <p className="text-xs text-slate-400">
          {historial.loading ? 'Actualizando…' : `Página ${historial.page} de ${historial.pages}`}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost !px-2" onClick={() => setHistorialPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="btn-ghost !px-2"
            onClick={() => setHistorialPage((p) => Math.min(historial.pages, p + 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
