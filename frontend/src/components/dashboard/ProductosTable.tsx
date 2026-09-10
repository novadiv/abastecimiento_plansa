import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { Producto } from '@/types/producto';
import { useProductosContext } from '@/context/ProductosContext';
import { formatCompactCurrency, formatNumber, truncateText } from '@/utils/formatters';
import { exportToCSV } from '@/services/exportService';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { Badge } from '@/components/common/Badge';

type CellFormat = 'text' | 'number' | 'currency-usd' | 'badge';

interface ColumnDef {
  key: string;
  label: string;
  format: CellFormat;
}

const COLUMNS: ColumnDef[] = [
  { key: 'codigo', label: 'Código', format: 'text' },
  { key: 'nombre', label: 'Nombre', format: 'text' },
  { key: 'familia_nombre', label: 'Familia', format: 'badge' },
  { key: 'linea_nombre', label: 'Línea', format: 'text' },
  { key: 'status', label: 'Status', format: 'badge' },
  { key: 'criticidad', label: 'Criticidad', format: 'badge' },
  { key: 'segmento_abc', label: 'Segmento', format: 'badge' },
  { key: 'proveedor', label: 'Proveedor', format: 'text' },
  { key: 'stock_actual', label: 'Stock Actual', format: 'number' },
  { key: 'cobertura_actual', label: 'Cobertura Actual', format: 'number' },
  { key: 'compra_sugerida', label: 'Compra Sugerida', format: 'number' },
  { key: 'valor_compra_usd', label: 'Valor Compra (USD)', format: 'currency-usd' },
  { key: 'total_valorizado', label: 'Total Valorizado (USD)', format: 'currency-usd' },
  { key: 'tendencia', label: 'Tendencia', format: 'badge' },
  { key: 'precio_confiabilidad', label: 'Confiabilidad Precio', format: 'badge' },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function renderCell(value: unknown, format: CellFormat) {
  if (value === null || value === undefined || value === '') return '—';

  if (format === 'badge' && typeof value === 'string') return <Badge>{value}</Badge>;
  if (format === 'number' && typeof value === 'number') return formatNumber(value, Number.isInteger(value) ? 0 : 1);
  if (format === 'currency-usd' && typeof value === 'number') return formatCompactCurrency(value);
  if (typeof value === 'string') return truncateText(value, 48);
  return String(value);
}

export function ProductosTable() {
  const { productos, total, pages, query, loading, error, setPage, setLimit, setSort } = useProductosContext();

  function handleSort(key: string) {
    if (query.sort_by !== key) {
      setSort(key, -1);
      return;
    }
    setSort(key, query.sort_order === -1 ? 1 : -1);
  }

  function handleExport() {
    exportToCSV(
      productos,
      COLUMNS.map((c) => ({ key: c.key, label: c.label })),
      'productos.csv',
    );
  }

  if (loading && productos.length === 0) return <LoadingState message="Cargando productos..." />;
  if (error) return <ErrorState message={error} />;
  if (productos.length === 0) {
    return <EmptyState title="No hay productos que coincidan con los filtros aplicados" />;
  }

  const startIndex = (query.page - 1) * query.limit;

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <p className="text-sm text-slate-500">
          Mostrando {(startIndex + 1).toLocaleString('es-PE')}-
          {Math.min(startIndex + query.limit, total).toLocaleString('es-PE')} de {total.toLocaleString('es-PE')} registros
          {loading && <span className="ml-2 text-xs text-slate-400">Actualizando…</span>}
        </p>
        <button type="button" className="btn-secondary" onClick={handleExport}>
          <Download size={14} /> Exportar página (CSV)
        </button>
      </div>

      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              {COLUMNS.map((col, idx) => {
                const isSorted = query.sort_by === col.key;
                const Icon = isSorted ? (query.sort_order === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`cursor-pointer select-none whitespace-nowrap border-b border-slate-200 px-3 py-2.5 hover:bg-slate-100 ${
                      idx === 0 ? 'sticky left-0 z-10 bg-slate-50' : ''
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      <Icon size={12} className={isSorted ? 'text-brand-600' : 'text-slate-300'} />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {productos.map((row: Producto) => (
              <tr key={row.codigo} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                {COLUMNS.map((col, idx) => (
                  <td
                    key={col.key}
                    className={`whitespace-nowrap px-3 py-2 text-slate-600 ${
                      idx === 0 ? 'sticky left-0 z-10 bg-white font-medium text-slate-700' : ''
                    }`}
                  >
                    {renderCell(row[col.key], col.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          Registros por página
          <select
            value={query.limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="input !w-auto !py-1.5 text-xs"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost !px-2"
            disabled={query.page <= 1}
            onClick={() => setPage(Math.max(1, query.page - 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-slate-500">
            Página {query.page} de {pages.toLocaleString('es-PE')}
          </span>
          <button
            type="button"
            className="btn-ghost !px-2"
            disabled={query.page >= pages}
            onClick={() => setPage(Math.min(pages, query.page + 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
