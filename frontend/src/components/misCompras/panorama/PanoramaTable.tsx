import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePanoramaContext } from '@/context/PanoramaContext';
import { formatDate, formatNumber, truncateText } from '@/utils/formatters';
import { PanoramaNivelBadge, PanoramaRecomendacionBadge } from './PanoramaNivelBadge';
import { EmptyState } from '@/components/common/EmptyState';
import type { MaterialPanorama } from '@/types/panorama';

const PAGE_SIZE = 25;

type SortKey = 'vecesSolicitado' | 'consumoMensualEstimado' | 'ultimaSolicitud' | 'cantidadRecomendada';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'vecesSolicitado', label: 'Veces solicitado' },
  { key: 'consumoMensualEstimado', label: 'Consumo mensual' },
  { key: 'ultimaSolicitud', label: 'Última solicitud' },
  { key: 'cantidadRecomendada', label: 'Necesidad estimada' },
];

function getValue(m: MaterialPanorama, key: SortKey): number {
  switch (key) {
    case 'vecesSolicitado':
      return m.vecesSolicitado;
    case 'consumoMensualEstimado':
      return m.consumoMensualEstimado ?? -Infinity;
    case 'ultimaSolicitud':
      return m.ultimaSolicitud ? new Date(m.ultimaSolicitud).getTime() : -Infinity;
    case 'cantidadRecomendada':
      return m.cantidadRecomendada ?? -Infinity;
    default:
      return 0;
  }
}

/** "PANORAMA COMPLETO DE MATERIALES" — Nivel 1: tabla general con clasificación, consumo y recomendación. */
export function PanoramaTable() {
  const { materiales, seleccionarMaterial } = usePanoramaContext();
  const [sortKey, setSortKey] = useState<SortKey>('vecesSolicitado');
  const [direction, setDirection] = useState<1 | -1>(-1);
  const [page, setPage] = useState(1);

  const ordenados = useMemo(() => [...materiales].sort((a, b) => (getValue(a, sortKey) - getValue(b, sortKey)) * direction), [materiales, sortKey, direction]);
  const totalPages = Math.max(1, Math.ceil(ordenados.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagina = ordenados.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setDirection((d) => (d === -1 ? 1 : -1));
    } else {
      setSortKey(key);
      setDirection(-1);
    }
    setPage(1);
  }

  if (materiales.length === 0) {
    return <EmptyState title="No hay materiales que coincidan con los filtros/categorías seleccionadas" />;
  }

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Panorama completo de materiales</h3>
          <p className="text-xs text-slate-400">{formatNumber(materiales.length)} materiales · clic en una fila para ver el plan de acción</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SORT_OPTIONS.map((opt) => {
            const active = sortKey === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleSort(opt.key)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {opt.label}
                {active && (direction === -1 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5">Código / Descripción</th>
              <th className="px-3 py-2.5">Clasificación</th>
              <th className="px-3 py-2.5">Veces solicitado</th>
              <th className="px-3 py-2.5">Consumo mensual</th>
              <th className="px-3 py-2.5">Última solicitud</th>
              <th className="px-3 py-2.5">Necesidad estimada</th>
              <th className="px-3 py-2.5">Recomendación</th>
            </tr>
          </thead>
          <tbody>
            {pagina.map((m, idx) => (
              <tr
                key={m.codigo}
                className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/70"
                onClick={() => seleccionarMaterial(m.codigo)}
              >
                <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm">
                  <p className="font-medium text-brand-700 hover:underline" title={m.producto}>
                    {truncateText(m.producto, 44)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {m.codigo} · #{(currentPage - 1) * PAGE_SIZE + idx + 1}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <PanoramaNivelBadge nivel={m.nivel} />
                </td>
                <td className="px-3 py-2 text-sm text-slate-600">{formatNumber(m.vecesSolicitado)}</td>
                <td className="px-3 py-2 text-sm text-slate-600">
                  {m.consumoMensualEstimado !== null ? `${formatNumber(m.consumoMensualEstimado, 1)} ${m.unidadMedida ?? ''}` : 'Dato no disponible'}
                </td>
                <td className="px-3 py-2 text-sm text-slate-600">{formatDate(m.ultimaSolicitud)}</td>
                <td className="px-3 py-2 text-sm text-slate-600">
                  {m.cantidadRecomendada !== null
                    ? `${formatNumber(m.cantidadRecomendada, 1)} ${m.unidadMedida ?? ''}`
                    : m.nivel === 'estacional'
                      ? 'Según temporada'
                      : 'Bajo requerimiento'}
                </td>
                <td className="px-3 py-2">
                  <PanoramaRecomendacionBadge recomendacion={m.recomendacion} />
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
    </div>
  );
}
