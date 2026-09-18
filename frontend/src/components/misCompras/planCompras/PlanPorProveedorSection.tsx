import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { usePlanComprasContext } from '@/context/PlanComprasContext';
import { formatCompactCurrency, formatNumber, truncateText } from '@/utils/formatters';
import { TandaBadge } from './EstadoBadges';
import { EmptyState } from '@/components/common/EmptyState';
import type { PlanProveedor, TandaCompra } from '@/types/planCompras';

/** Secciones 5 + 6 + 8: consolidación por proveedor, cuántas OC recomendadas, y el detalle "OC a generar". */
export function PlanPorProveedorSection() {
  const { proveedores } = usePlanComprasContext();

  if (proveedores.length === 0) {
    return <EmptyState title="No hay materiales pendientes de compra con los filtros aplicados" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800"># Plan de Compras – 2 meses por Proveedor</h3>
        <p className="text-xs text-slate-400">
          {formatNumber(proveedores.length)} proveedores con materiales pendientes · "Proveedor sugerido" = el más frecuente históricamente para
          ese material (aproximación, no una asignación confirmada).
        </p>
      </div>
      {proveedores.map((p) => (
        <ProveedorCard key={p.proveedor} proveedor={p} />
      ))}
    </div>
  );
}

function ProveedorCard({ proveedor }: { proveedor: PlanProveedor }) {
  const [open, setOpen] = useState(false);
  const porTanda = new Map<TandaCompra, typeof proveedor.materiales>();
  proveedor.materiales.forEach((m) => {
    const t = m.tanda ?? 'programada';
    if (!porTanda.has(t)) porTanda.set(t, []);
    porTanda.get(t)!.push(m);
  });

  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left">
        <div>
          <p className="text-sm font-semibold text-slate-800">{proveedor.proveedor}</p>
          <p className="text-xs text-slate-400">
            {formatNumber(proveedor.nRequerimientosPendientes)} requerimientos · {formatNumber(proveedor.nCodigos)} códigos ·{' '}
            {formatNumber(proveedor.cantidadTotalUnidades, 1)} unidades totales
            {proveedor.montoEstimado !== null && ` · ${formatCompactCurrency(proveedor.montoEstimado, 'PEN')} aprox.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            Generar: {proveedor.ocRecomendadas} OC{proveedor.ocRecomendadas > 1 ? 's' : ''}
          </span>
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          {Array.from(porTanda.entries()).map(([tanda, materiales]) => (
            <div key={tanda}>
              {porTanda.size > 1 && (
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-600">
                    OC {Array.from(porTanda.keys()).indexOf(tanda) + 1} de {porTanda.size}
                  </p>
                  <TandaBadge tanda={tanda} />
                </div>
              )}
              {porTanda.size === 1 && (
                <div className="mb-2">
                  <TandaBadge tanda={tanda} />
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-400">
                      <th className="py-1 pr-4">Código</th>
                      <th className="py-1 pr-4">Descripción</th>
                      <th className="py-1 pr-4">Cantidad</th>
                      <th className="py-1 pr-4">Req. relacionados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiales.map((m) => (
                      <tr key={m.codigo} className="border-t border-slate-50">
                        <td className="py-1.5 pr-4 text-slate-700">{m.codigo}</td>
                        <td className="py-1.5 pr-4 text-slate-600" title={m.producto}>
                          {truncateText(m.producto, 40)}
                        </td>
                        <td className="py-1.5 pr-4 text-slate-600">
                          {formatNumber(m.cantidadPendienteTotal, 1)} {m.unidadMedida ?? ''}
                        </td>
                        <td className="py-1.5 pr-4 text-slate-500">{m.reqNumerosPendientes.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
