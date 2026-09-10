import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FrecuenciaNivel, ProductoFrecuente } from '@/types/requerimiento';
import { useMisComprasContext } from '@/context/MisComprasContext';
import { formatCompactCurrency, formatDate, formatNumber, truncateText } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

const NIVEL_CONFIG: Record<FrecuenciaNivel, { dot: string; label: string; classes: string }> = {
  alta: { dot: '🔴', label: 'Alta frecuencia', classes: 'bg-rose-50 text-rose-700' },
  media: { dot: '🟡', label: 'Frecuencia media', classes: 'bg-amber-50 text-amber-700' },
  baja: { dot: '🟢', label: 'Baja frecuencia', classes: 'bg-emerald-50 text-emerald-700' },
};

function NivelBadge({ nivel }: { nivel: FrecuenciaNivel }) {
  const cfg = NIVEL_CONFIG[nivel];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.classes}`}>
      <span aria-hidden>{cfg.dot}</span> {cfg.label}
    </span>
  );
}

function Row({ rank, producto }: { rank: number; producto: ProductoFrecuente }) {
  return (
    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-semibold text-slate-400">{rank}</td>
      <td className="px-3 py-2 text-sm">
        <p className="font-medium text-slate-700" title={producto.producto}>
          {truncateText(producto.producto, 52)}
        </p>
        <p className="text-xs text-slate-400">
          {producto.codigo} {producto.familia ? `· ${producto.familia}` : ''}
        </p>
      </td>
      <td className="px-3 py-2 text-sm text-slate-600">{formatNumber(producto.vecesComprado)}</td>
      <td className="px-3 py-2 text-sm text-slate-600">
        {formatNumber(producto.cantidadTotal, 1)} {producto.unidadMedida ?? ''}
      </td>
      <td className="px-3 py-2 text-sm text-slate-600">{formatDate(producto.primeraCompra)}</td>
      <td className="px-3 py-2 text-sm text-slate-600">{formatDate(producto.ultimaCompra)}</td>
      <td className="px-3 py-2 text-sm text-slate-600">
        {producto.frecuenciaPromedioDias !== null ? `Cada ${formatNumber(producto.frecuenciaPromedioDias, 0)} días` : '—'}
      </td>
      <td className="px-3 py-2 text-sm text-slate-600" title={producto.proveedorPrincipal ?? ''}>
        {producto.proveedorPrincipal ? truncateText(producto.proveedorPrincipal, 28) : '—'}
      </td>
      <td className="px-3 py-2 text-sm text-slate-600">
        {producto.valorEstimado !== null
          ? formatCompactCurrency(producto.valorEstimado, producto.monedaReferencia === 'USD' ? 'USD' : 'PEN')
          : '—'}
        {producto.valorEstimado !== null && <span className="ml-1 text-[10px] text-slate-400">aprox.</span>}
      </td>
      <td className="px-3 py-2">
        <NivelBadge nivel={producto.nivelFrecuencia} />
      </td>
    </tr>
  );
}

export function ProductosFrecuentesTable() {
  const { data } = useMisComprasContext();
  const { consolidado, setConsolidadoPage } = data;

  if (consolidado.loading && consolidado.productos.length === 0) {
    return <LoadingState message="Analizando tu historial de compras..." />;
  }
  if (consolidado.error) return <ErrorState message={consolidado.error} />;
  if (consolidado.productos.length === 0) {
    return <EmptyState title="No se encontraron productos con los filtros aplicados" />;
  }

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="border-b border-slate-100 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Top de productos que compro</h3>
        <p className="text-xs text-slate-400">
          Ordenado de más a menos recurrente · {formatNumber(consolidado.totalProductos)} productos distintos en total
        </p>
      </div>

      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Producto</th>
              <th className="px-3 py-2.5">Veces comprado</th>
              <th className="px-3 py-2.5">Cantidad total</th>
              <th className="px-3 py-2.5">Primera compra</th>
              <th className="px-3 py-2.5">Última compra</th>
              <th className="px-3 py-2.5">Frecuencia</th>
              <th className="px-3 py-2.5">Proveedor principal</th>
              <th className="px-3 py-2.5">Valor estimado</th>
              <th className="px-3 py-2.5">Clasificación</th>
            </tr>
          </thead>
          <tbody>
            {consolidado.productos.map((producto, idx) => (
              <Row key={producto.codigo} rank={(consolidado.page - 1) * consolidado.limit + idx + 1} producto={producto} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
        <p className="text-xs text-slate-400">
          {consolidado.loading ? 'Actualizando…' : `Página ${consolidado.page} de ${consolidado.pages}`}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost !px-2" onClick={() => setConsolidadoPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="btn-ghost !px-2"
            onClick={() => setConsolidadoPage((p) => Math.min(consolidado.pages, p + 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
