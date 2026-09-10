import type { GrupoComparacion } from '@/utils/rotacionInsights';
import { formatCompactCurrency, formatCompactNumber, formatNumber, formatPercent } from '@/utils/formatters';

export function ComparacionCards({ titulo, subtitulo, grupos }: { titulo: string; subtitulo: string; grupos: GrupoComparacion[] }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
      <p className="mb-4 text-xs text-slate-400">{subtitulo}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {grupos.map((g) => (
          <div key={g.etiqueta} className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700">{g.etiqueta}</p>
            <p className="text-2xl font-semibold text-slate-800">{formatNumber(g.cantidadMateriales)}</p>
            <p className="mb-3 text-xs text-slate-400">{formatPercent(g.porcentajeDelTotal)} del total</p>
            <dl className="space-y-1 text-xs text-slate-500">
              <div className="flex justify-between">
                <dt>Movimientos</dt>
                <dd className="font-medium text-slate-700">{formatCompactNumber(g.movimientos)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Cantidad total</dt>
                <dd className="font-medium text-slate-700">{formatCompactNumber(g.cantidadTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Valor (aprox.)</dt>
                <dd className="font-medium text-slate-700">{formatCompactCurrency(g.valorTotal, 'PEN')}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
