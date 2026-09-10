import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductoRotacion, RotacionSortKey } from '@/types/rotacion';
import { useRotacionContext } from '@/context/RotacionContext';
import { sortRotacion } from '@/utils/rotacionCalculations';
import { formatCompactCurrency, formatDate, formatNumber, truncateText } from '@/utils/formatters';
import { NivelBadge, EstacionalBadge } from './NivelBadge';
import { EmptyState } from '@/components/common/EmptyState';

const PAGE_SIZE = 25;

const SORT_OPTIONS: { key: RotacionSortKey; label: string }[] = [
  { key: 'movimientos', label: 'Movimientos' },
  { key: 'cantidadTotal', label: 'Cantidad solicitada' },
  { key: 'stockActual', label: 'Stock actual' },
  { key: 'valorEstimado', label: 'Valor comprado' },
  { key: 'ultimoMovimiento', label: 'Último movimiento' },
  { key: 'frecuenciaPromedioDias', label: 'Frecuencia' },
];

interface Props {
  materiales?: ProductoRotacion[];
  titulo?: string;
}

export function RankingMaterialesTable({ materiales, titulo = 'Materiales de mayor movimiento' }: Props) {
  const { materiales: materialesFiltrados, seleccionarMaterial } = useRotacionContext();
  const fuente = materiales ?? materialesFiltrados;

  const [sortKey, setSortKey] = useState<RotacionSortKey>('movimientos');
  const [direction, setDirection] = useState<1 | -1>(-1);
  const [page, setPage] = useState(1);

  const ordenados = useMemo(() => sortRotacion(fuente, sortKey, direction), [fuente, sortKey, direction]);
  const totalPages = Math.max(1, Math.ceil(ordenados.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagina = ordenados.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSort(key: RotacionSortKey) {
    if (key === sortKey) {
      setDirection((d) => (d === -1 ? 1 : -1));
    } else {
      setSortKey(key);
      setDirection(-1);
    }
    setPage(1);
  }

  if (fuente.length === 0) {
    return <EmptyState title="No hay materiales que coincidan con los filtros aplicados" />;
  }

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
          <p className="text-xs text-slate-400">{formatNumber(fuente.length)} materiales</p>
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
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Material</th>
              <th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5">Movimientos</th>
              <th className="px-3 py-2.5">Cantidad total</th>
              <th className="px-3 py-2.5">Stock actual</th>
              <th className="px-3 py-2.5">Valor (aprox.)</th>
              <th className="px-3 py-2.5">Último movimiento</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5">Rotación</th>
            </tr>
          </thead>
          <tbody>
            {pagina.map((m, idx) => (
              <tr
                key={m.codigo}
                className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/70"
                onClick={() => seleccionarMaterial(m.codigo)}
              >
                <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-semibold text-slate-400">
                  {(currentPage - 1) * PAGE_SIZE + idx + 1}
                </td>
                <td className="px-3 py-2 text-sm">
                  <p className="font-medium text-brand-700 hover:underline" title={m.producto}>
                    {truncateText(m.producto, 48)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {m.codigo}
                    {m.esEstacional && <span className="ml-1" title={`Estacional — mayor demanda en ${m.mesMayorConsumo}`}>📅</span>}
                  </p>
                </td>
                <td className="px-3 py-2 text-sm text-slate-600">{m.familia ?? '—'}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{formatNumber(m.movimientos)}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{formatNumber(m.cantidadTotal, 1)}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{m.stockActual !== null ? formatNumber(m.stockActual, 1) : 'Dato no disponible'}</td>
                <td className="px-3 py-2 text-sm text-slate-600">
                  {m.valorEstimado !== null ? formatCompactCurrency(m.valorEstimado, m.monedaReferencia === 'USD' ? 'USD' : 'PEN') : 'Dato no disponible'}
                </td>
                <td className="px-3 py-2 text-sm text-slate-600">{formatDate(m.ultimoMovimiento)}</td>
                <td className="px-3 py-2 text-sm">
                  <span className={m.estado === 'activo' ? 'text-emerald-600' : 'text-slate-400'}>
                    {m.estado === 'activo' ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <NivelBadge nivel={m.nivel} />
                    {m.esEstacional && <EstacionalBadge />}
                  </div>
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
          <button
            type="button"
            className="btn-ghost !px-2"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
