import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePlanComprasContext } from '@/context/PlanComprasContext';
import { formatDate, formatNumber, truncateText } from '@/utils/formatters';
import { EstadoMaterialBadge } from './EstadoBadges';
import { EmptyState } from '@/components/common/EmptyState';
import type { EstadoMaterialPlan } from '@/types/planCompras';

const PAGE_SIZE = 25;

interface FilaRequerimiento {
  reqNro: string;
  codigo: string;
  producto: string;
  cantidad: number | null;
  proveedor: string | null;
  fecha: string | null;
  estado: EstadoMaterialPlan;
}

/** Sección 10: solo los requerimientos de jcamacho dentro del horizonte de planificación, pendientes o que requieren atención. */
export function RequerimientosParaPlanificarTable() {
  const { materiales } = usePlanComprasContext();
  const [page, setPage] = useState(1);

  const filas = useMemo(() => {
    const rows: FilaRequerimiento[] = [];
    materiales.forEach((m) => {
      m.requerimientosPendientes.forEach((r) =>
        rows.push({ reqNro: r.reqNro, codigo: m.codigo, producto: m.producto, cantidad: r.saldoPendiente, proveedor: m.proveedorSugerido, fecha: r.fecha, estado: 'pendiente' }),
      );
      m.requerimientosParciales.forEach((r) =>
        rows.push({ reqNro: r.reqNro, codigo: m.codigo, producto: m.producto, cantidad: r.saldoPendiente, proveedor: m.proveedorSugerido, fecha: r.fecha, estado: 'parcial' }),
      );
    });
    return rows.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
  }, [materiales]);

  const totalPages = Math.max(1, Math.ceil(filas.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagina = filas.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="border-b border-slate-100 p-4">
        <h3 className="text-sm font-semibold text-slate-800"># Requerimientos para Planificar</h3>
        <p className="text-xs text-slate-400">
          {formatNumber(filas.length)} requerimientos de JCAMACHO pendientes o parcialmente atendidos, sin una OC que cubra completamente la
          necesidad.
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No hay requerimientos pendientes de planificar con los filtros aplicados" />
        </div>
      ) : (
        <>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5">N° Req.</th>
                  <th className="px-3 py-2.5">Código</th>
                  <th className="px-3 py-2.5">Descripción</th>
                  <th className="px-3 py-2.5">Cantidad</th>
                  <th className="px-3 py-2.5">Proveedor sugerido</th>
                  <th className="px-3 py-2.5">Fecha de solicitud</th>
                  <th className="px-3 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {pagina.map((f, idx) => (
                  <tr key={`${f.reqNro}-${f.codigo}-${idx}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-medium text-slate-700">{f.reqNro}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{f.codigo}</td>
                    <td className="px-3 py-2 text-sm text-slate-600" title={f.producto}>
                      {truncateText(f.producto, 40)}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600">{f.cantidad !== null ? formatNumber(f.cantidad, 1) : '—'}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{f.proveedor ?? 'Dato no disponible'}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{formatDate(f.fecha)}</td>
                    <td className="px-3 py-2">
                      <EstadoMaterialBadge estado={f.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
            <p className="text-xs text-slate-400">
              Página {currentPage} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-ghost !px-2" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft size={16} />
              </button>
              <button type="button" className="btn-ghost !px-2" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
