import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Database, Download, RefreshCw, X } from 'lucide-react';
import { useProductosCatalogo } from '@/hooks/useProductosCatalogo';
import { CargaProgresoBanner } from '@/components/rotacion/CargaProgresoBanner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { exportToCSV } from '@/services/exportService';
import { formatCompactCurrency, formatDateTime, formatNumber, truncateText } from '@/utils/formatters';
import {
  applyProductosCatalogoFilters,
  buildFiltroOpciones,
  sortProductosCatalogo,
  type ProductosCatalogoFilters,
  type ProductosCatalogoSortKey,
} from '@/utils/productosCatalogoFiltros';
import type { ProductoResumen } from '@/types/producto';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500, 1000];

const SORT_OPTIONS: { key: ProductosCatalogoSortKey; label: string }[] = [
  { key: 'codigo', label: 'Código' },
  { key: 'stock_actual', label: 'Stock actual' },
  { key: 'cobertura_actual', label: 'Cobertura' },
  { key: 'compra_sugerida', label: 'Compra sugerida' },
  { key: 'valor_compra_usd', label: 'Valor compra' },
  { key: 'total_valorizado', label: 'Total valorizado' },
];

const EMPTY_FILTERS: ProductosCatalogoFilters = {};
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Vista alternativa de "Productos": trae el catálogo COMPLETO (23,000+
 * productos, sin paginar del lado del servidor) en segundo plano, lo cachea
 * (localStorage, 24h) y a partir de ahí todo el filtrado/orden/paginación
 * ocurre en el navegador. Complementa a la vista rápida por defecto
 * (`ProductosTable`, paginada en el servidor) — no la reemplaza.
 */
export function ProductosCatalogoCompleto() {
  const { productos, loading, progress, error, lastUpdated, iniciado, iniciar, refresh } = useProductosCatalogo();
  const [filters, setFilters] = useState<ProductosCatalogoFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [sortKey, setSortKey] = useState<ProductosCatalogoSortKey>('total_valorizado');
  const [direction, setDirection] = useState<1 | -1>(-1);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput || undefined }));
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const opciones = useMemo(() => buildFiltroOpciones(productos), [productos]);
  const filtrados = useMemo(() => applyProductosCatalogoFilters(productos, filters), [productos, filters]);
  const ordenados = useMemo(() => sortProductosCatalogo(filtrados, sortKey, direction), [filtrados, sortKey, direction]);

  const totalPages = Math.max(1, Math.ceil(ordenados.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagina = ordenados.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const hasActiveFilters = Boolean(
    filters.search || filters.familia || filters.linea || filters.status || filters.criticidad || filters.segmento_abc || filters.tendencia,
  );

  function updateFilters(patch: Partial<ProductosCatalogoFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }

  function handleClearFilters() {
    setSearchInput('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function handleSort(key: ProductosCatalogoSortKey) {
    if (key === sortKey) {
      setDirection((d) => (d === -1 ? 1 : -1));
    } else {
      setSortKey(key);
      setDirection(-1);
    }
    setPage(1);
  }

  function handleExport() {
    exportToCSV(
      ordenados,
      [
        { key: 'codigo', label: 'Código' },
        { key: 'nombre', label: 'Nombre' },
        { key: 'familia_nombre', label: 'Familia' },
        { key: 'linea_nombre', label: 'Línea' },
        { key: 'status', label: 'Status' },
        { key: 'criticidad', label: 'Criticidad' },
        { key: 'segmento_abc', label: 'Segmento' },
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'stock_actual', label: 'Stock Actual' },
        { key: 'cobertura_actual', label: 'Cobertura Actual' },
        { key: 'compra_sugerida', label: 'Compra Sugerida' },
        { key: 'valor_compra_usd', label: 'Valor Compra (USD)' },
        { key: 'total_valorizado', label: 'Total Valorizado (USD)' },
        { key: 'tendencia', label: 'Tendencia' },
        { key: 'precio_confiabilidad', label: 'Confiabilidad Precio' },
      ],
      'productos_catalogo_completo.csv',
    );
  }

  // Estado inicial: todavía no se pidió la carga completa (es pesada, ~5 minutos) — se pide explícitamente.
  if (!iniciado) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Database size={22} strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">Ver el catálogo completo de productos</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
            Trae los 23,000+ productos del sistema (no solo la página visible) para poder buscar, filtrar y ordenar todo
            en una sola vista, sin paginar contra el servidor. Es una carga pesada — toma aproximadamente 5 minutos la
            primera vez (117 páginas) y luego queda guardada en este navegador por 24 horas.
          </p>
        </div>
        <button type="button" onClick={iniciar} className="btn-primary mt-1">
          <Database size={14} /> Cargar catálogo completo
        </button>
      </div>
    );
  }

  if (error && lastUpdated === null) return <ErrorState message={error} onRetry={refresh} />;

  if (loading) {
    return (
      <CargaProgresoBanner
        progress={progress ? { paginaActual: progress.paginaActual, totalPaginas: progress.totalPaginas, totalUnidades: progress.productosTotales } : null}
        titulo="Cargando catálogo completo de productos…"
        descripcion="Consulta pesada sobre 23,000+ productos (~5 minutos); solo ocurre una vez (se guarda en este navegador por 24h)."
        unidadLabel="productos"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-100 bg-brand-50/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Database size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-900">Catálogo completo — {formatNumber(productos.length)} productos</p>
            <p className="text-xs text-brand-700/80">Cargado {formatDateTime(lastUpdated)} · filtros y orden aplicados en tu navegador</p>
          </div>
        </div>
        <button type="button" onClick={refresh} className="btn-secondary">
          <RefreshCw size={14} /> Actualizar catálogo
        </button>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label className="label-text">Buscar</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por código o nombre..."
              className="input"
            />
          </div>
          <FiltroSelect label="Familia" value={filters.familia} options={opciones.familias} onChange={(v) => updateFilters({ familia: v })} />
          <FiltroSelect label="Línea" value={filters.linea} options={opciones.lineas} onChange={(v) => updateFilters({ linea: v })} />
          <FiltroSelect label="Status" value={filters.status} options={opciones.status} onChange={(v) => updateFilters({ status: v })} />
          <FiltroSelect label="Criticidad" value={filters.criticidad} options={opciones.criticidades} onChange={(v) => updateFilters({ criticidad: v })} />
          <FiltroSelect label="Segmento" value={filters.segmento_abc} options={opciones.segmentos} onChange={(v) => updateFilters({ segmento_abc: v })} />
          <FiltroSelect label="Tendencia" value={filters.tendencia} options={opciones.tendencias} onChange={(v) => updateFilters({ tendencia: v })} />
          <button type="button" onClick={handleClearFilters} className="btn-ghost" disabled={!hasActiveFilters}>
            <X size={14} /> Limpiar filtros
          </button>
        </div>
      </div>

      {ordenados.length === 0 ? (
        <EmptyState title="No hay productos que coincidan con los filtros aplicados" />
      ) : (
        <div className="card flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <p className="text-sm text-slate-500">{formatNumber(ordenados.length)} productos coinciden con los filtros</p>
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
              <button type="button" className="btn-secondary" onClick={handleExport}>
                <Download size={14} /> Exportar (CSV)
              </button>
            </div>
          </div>

          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5">Código / Nombre</th>
                  <th className="px-3 py-2.5">Familia</th>
                  <th className="px-3 py-2.5">Línea</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Criticidad</th>
                  <th className="px-3 py-2.5">Segmento</th>
                  <th className="px-3 py-2.5">Proveedor</th>
                  <th className="px-3 py-2.5">Stock actual</th>
                  <th className="px-3 py-2.5">Cobertura</th>
                  <th className="px-3 py-2.5">Compra sugerida</th>
                  <th className="px-3 py-2.5">Valor compra (USD)</th>
                  <th className="px-3 py-2.5">Total valorizado (USD)</th>
                  <th className="px-3 py-2.5">Tendencia</th>
                </tr>
              </thead>
              <tbody>
                {pagina.map((p: ProductoResumen) => (
                  <tr key={p.codigo} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm">
                      <p className="font-medium text-slate-700" title={p.nombre ?? undefined}>
                        {truncateText(p.nombre ?? '—', 48)}
                      </p>
                      <p className="text-xs text-slate-400">{p.codigo}</p>
                    </td>
                    <td className="px-3 py-2 text-sm">{p.familia_nombre ? <Badge>{p.familia_nombre}</Badge> : '—'}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{p.linea_nombre ?? '—'}</td>
                    <td className="px-3 py-2 text-sm">{p.status ? <Badge>{p.status}</Badge> : '—'}</td>
                    <td className="px-3 py-2 text-sm">{p.criticidad ? <Badge>{p.criticidad}</Badge> : '—'}</td>
                    <td className="px-3 py-2 text-sm">{p.segmento_abc ? <Badge>{p.segmento_abc}</Badge> : '—'}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{truncateText(p.proveedor ?? '—', 32)}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{p.stock_actual !== null ? formatNumber(p.stock_actual, 1) : '—'}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{p.cobertura_actual !== null ? formatNumber(p.cobertura_actual, 1) : '—'}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{p.compra_sugerida !== null ? formatNumber(p.compra_sugerida, 1) : '—'}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{p.valor_compra_usd !== null ? formatCompactCurrency(p.valor_compra_usd) : '—'}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{p.total_valorizado !== null ? formatCompactCurrency(p.total_valorizado) : '—'}</td>
                    <td className="px-3 py-2 text-sm">{p.tendencia ? <Badge>{p.tendencia}</Badge> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              Registros por página
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="input !w-auto !py-1.5 text-xs">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-ghost !px-2" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-slate-500">
                Página {currentPage} de {totalPages}
              </span>
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
      )}
    </div>
  );
}

function FiltroSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="w-40">
      <label className="label-text">{label}</label>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} className="input">
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
