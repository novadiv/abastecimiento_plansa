import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarClock } from 'lucide-react';
import { useRotacionContext } from '@/context/RotacionContext';
import { formatNumber, truncateText } from '@/utils/formatters';
import { EmptyState } from '@/components/common/EmptyState';

type SortKey = 'variacionConsumoPct' | 'cantidadTotal' | 'movimientos';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'variacionConsumoPct', label: 'Variación estacional' },
  { key: 'cantidadTotal', label: 'Consumo total' },
  { key: 'movimientos', label: 'Movimientos' },
];

/**
 * Sección "Materiales Estacionales" (requerimiento #5): materiales que
 * concentran su consumo en ciertos meses del año — permite identificar qué
 * comprar con anticipación antes de la temporada de mayor demanda.
 */
export function MaterialesEstacionalesSection() {
  const { materiales, seleccionarMaterial } = useRotacionContext();
  const [sortKey, setSortKey] = useState<SortKey>('variacionConsumoPct');
  const [direction, setDirection] = useState<1 | -1>(-1);

  const estacionales = useMemo(() => {
    const filtrados = materiales.filter((m) => m.esEstacional);
    return [...filtrados].sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      return (va - vb) * direction;
    });
  }, [materiales, sortKey, direction]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setDirection((d) => (d === -1 ? 1 : -1));
    } else {
      setSortKey(key);
      setDirection(-1);
    }
  }

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <CalendarClock size={16} className="text-sky-600" /> Materiales Estacionales
          </h3>
          <p className="text-xs text-slate-400">
            {formatNumber(estacionales.length)} materiales cuyo consumo se concentra marcadamente en ciertos meses del
            año — planificar su compra con anticipación antes de esa temporada.
          </p>
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

      {estacionales.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No se detectaron materiales estacionales con los filtros aplicados" description="Se requiere evidencia de movimientos repartidos en varios meses distintos para clasificar un material como estacional — no se estima sin datos suficientes." />
        </div>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5">Material</th>
                <th className="px-3 py-2.5">Mes de mayor consumo</th>
                <th className="px-3 py-2.5">Consumo total</th>
                <th className="px-3 py-2.5">Consumo promedio mensual</th>
                <th className="px-3 py-2.5">Variación vs. promedio</th>
                <th className="px-3 py-2.5">Stock actual</th>
              </tr>
            </thead>
            <tbody>
              {estacionales.map((m) => (
                <tr
                  key={m.codigo}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/70"
                  onClick={() => seleccionarMaterial(m.codigo)}
                >
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm">
                    <p className="font-medium text-brand-700 hover:underline" title={m.producto}>
                      {truncateText(m.producto, 48)}
                    </p>
                    <p className="text-xs text-slate-400">{m.codigo}</p>
                  </td>
                  <td className="px-3 py-2 text-sm font-medium text-sky-700">{m.mesMayorConsumo}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">{formatNumber(m.cantidadTotal, 1)}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">{formatNumber(m.cantidadTotal / 12, 1)}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {m.variacionConsumoPct !== null ? `+${formatNumber(m.variacionConsumoPct, 0)}%` : 'Dato insuficiente'}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">{m.stockActual !== null ? formatNumber(m.stockActual, 1) : 'Dato no disponible'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
