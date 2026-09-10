import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useProductosContext } from '@/context/ProductosContext';

const STATUS_OPTIONS = ['Activo', 'Estacional', 'Posible descontinuado', 'Sin consumo'];
const CRITICIDAD_OPTIONS = ['ALTA', 'MEDIA', 'BAJA'];
const SEGMENTO_OPTIONS = ['A', 'B', 'C'];
const TENDENCIA_OPTIONS = ['CRECIENDO', 'ESTABLE', 'DECRECIENDO', 'SIN_DATOS'];

const SEARCH_DEBOUNCE_MS = 400;

export function ProductosFilters() {
  const { query, familias, lineas, updateFilters, clearFilters } = useProductosContext();
  const [searchInput, setSearchInput] = useState(query.search ?? '');

  // Debounce: solo dispara la búsqueda contra el servidor 400ms después de que el usuario deja de escribir.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== (query.search ?? '')) {
        updateFilters({ search: searchInput || undefined });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const hasActiveFilters = Boolean(
    query.search || query.familia || query.linea || query.status || query.criticidad || query.segmento_abc || query.tendencia,
  );

  function handleClear() {
    setSearchInput('');
    clearFilters();
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[220px] flex-1">
          <label className="label-text">Buscar</label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por código o nombre..."
              className="input pl-8"
            />
          </div>
        </div>

        <div className="w-48">
          <label className="label-text">Familia</label>
          <select
            value={query.familia ?? ''}
            onChange={(e) => updateFilters({ familia: e.target.value || undefined, linea: undefined })}
            className="input"
          >
            <option value="">Todas</option>
            {familias.map((f) => (
              <option key={f.nombre} value={f.nombre}>
                {f.nombre} ({f.cantidad})
              </option>
            ))}
          </select>
        </div>

        <div className="w-44">
          <label className="label-text">Línea</label>
          <select
            value={query.linea ?? ''}
            onChange={(e) => updateFilters({ linea: e.target.value || undefined })}
            className="input"
          >
            <option value="">Todas</option>
            {lineas.map((l) => (
              <option key={l.nombre} value={l.nombre}>
                {l.nombre} ({l.cantidad})
              </option>
            ))}
          </select>
        </div>

        <div className="w-40">
          <label className="label-text">Status</label>
          <select
            value={query.status ?? ''}
            onChange={(e) => updateFilters({ status: e.target.value || undefined })}
            className="input"
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="w-36">
          <label className="label-text">Criticidad</label>
          <select
            value={query.criticidad ?? ''}
            onChange={(e) => updateFilters({ criticidad: e.target.value || undefined })}
            className="input"
          >
            <option value="">Todas</option>
            {CRITICIDAD_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="w-32">
          <label className="label-text">Segmento</label>
          <select
            value={query.segmento_abc ?? ''}
            onChange={(e) => updateFilters({ segmento_abc: e.target.value || undefined })}
            className="input"
          >
            <option value="">Todos</option>
            {SEGMENTO_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="w-40">
          <label className="label-text">Tendencia</label>
          <select
            value={query.tendencia ?? ''}
            onChange={(e) => updateFilters({ tendencia: e.target.value || undefined })}
            className="input"
          >
            <option value="">Todas</option>
            {TENDENCIA_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <button type="button" onClick={handleClear} className="btn-ghost" disabled={!hasActiveFilters}>
          <X size={14} /> Limpiar filtros
        </button>
      </div>
    </div>
  );
}
