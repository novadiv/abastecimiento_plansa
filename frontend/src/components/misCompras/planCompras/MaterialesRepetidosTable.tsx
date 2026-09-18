import { usePlanComprasContext } from '@/context/PlanComprasContext';
import { formatCompactCurrency, formatNumber, truncateText } from '@/utils/formatters';
import { EmptyState } from '@/components/common/EmptyState';

/** Sección 7: códigos que aparecen en varios requerimientos pendientes durante el horizonte de planificación. */
export function MaterialesRepetidosTable() {
  const { materialesRepetidos } = usePlanComprasContext();

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="border-b border-slate-100 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Materiales que se están solicitando repetidamente</h3>
        <p className="text-xs text-slate-400">
          {formatNumber(materialesRepetidos.length)} códigos aparecen en 2+ requerimientos pendientes — candidatos a consolidar en una sola compra
          en vez de repetirla.
        </p>
      </div>

      {materialesRepetidos.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No se detectaron materiales repetidos con los filtros aplicados" />
        </div>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5">Código / Descripción</th>
                <th className="px-3 py-2.5">Proveedor sugerido</th>
                <th className="px-3 py-2.5">N° requerimientos</th>
                <th className="px-3 py-2.5">Cantidad total</th>
                <th className="px-3 py-2.5">OC actuales</th>
                <th className="px-3 py-2.5">OC recomendadas</th>
              </tr>
            </thead>
            <tbody>
              {materialesRepetidos.map((m) => (
                <tr key={m.codigo} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm">
                    <p className="font-medium text-slate-700" title={m.producto}>
                      {truncateText(m.producto, 44)}
                    </p>
                    <p className="text-xs text-slate-400">{m.codigo}</p>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">{m.proveedorSugerido ?? 'Dato no disponible'}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {m.reqNumerosPendientes.length} ({m.reqNumerosPendientes.slice(0, 4).join(', ')}
                    {m.reqNumerosPendientes.length > 4 ? '…' : ''})
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {formatNumber(m.cantidadPendienteTotal, 1)} {m.unidadMedida ?? ''}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">{m.ocExistentes.length}</td>
                  <td className="px-3 py-2 text-sm font-semibold text-brand-700">
                    1 OC (consolidada) {m.valorEstimadoPendiente !== null && `· ${formatCompactCurrency(m.valorEstimadoPendiente, m.monedaReferencia === 'USD' ? 'USD' : 'PEN')}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
