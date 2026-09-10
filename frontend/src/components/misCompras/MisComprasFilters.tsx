import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useMisComprasContext } from '@/context/MisComprasContext';

const MESES = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

const SEARCH_DEBOUNCE_MS = 400;

export function MisComprasFilters() {
  const { filtrosDisponibles, filters, updateFilters, clearFilters } = useMisComprasContext();
  const [searchInput, setSearchInput] = useState(filters.search ?? '');

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== (filters.search ?? '')) {
        updateFilters({ search: searchInput || undefined });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const hasActiveFilters = Boolean(
    filters.año || filters.mes || filters.familia || filters.area_origen || filters.proveedor || filters.estado_normalizado || filters.search,
  );

  function handleClear() {
    setSearchInput('');
    clearFilters();
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1">
          <label className="label-text">Buscar producto</label>
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

        <div className="w-28">
          <label className="label-text">Año</label>
          <select
            value={filters.año ?? ''}
            onChange={(e) => updateFilters({ año: e.target.value ? Number(e.target.value) : undefined })}
            className="input"
          >
            <option value="">Todos</option>
            {filtrosDisponibles.años.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="w-36">
          <label className="label-text">Mes</label>
          <select
            value={filters.mes ?? ''}
            onChange={(e) => updateFilters({ mes: e.target.value ? Number(e.target.value) : undefined })}
            className="input"
          >
            <option value="">Todos</option>
            {MESES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-48">
          <label className="label-text">Familia</label>
          <select
            value={filters.familia ?? ''}
            onChange={(e) => updateFilters({ familia: e.target.value || undefined })}
            className="input"
          >
            <option value="">Todas</option>
            {filtrosDisponibles.familias.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div className="w-48">
          <label className="label-text">Área de origen</label>
          <select
            value={filters.area_origen ?? ''}
            onChange={(e) => updateFilters({ area_origen: e.target.value || undefined })}
            className="input"
          >
            <option value="">Todas</option>
            {filtrosDisponibles.areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="w-48">
          <label className="label-text">Proveedor</label>
          <select
            value={filters.proveedor ?? ''}
            onChange={(e) => updateFilters({ proveedor: e.target.value || undefined })}
            className="input"
          >
            <option value="">Todos</option>
            {filtrosDisponibles.proveedores.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="w-44">
          <label className="label-text">Estado</label>
          <select
            value={filters.estado_normalizado ?? ''}
            onChange={(e) => updateFilters({ estado_normalizado: e.target.value || undefined })}
            className="input"
          >
            <option value="">Todos</option>
            {filtrosDisponibles.estados_normalizados.map((e) => (
              <option key={e} value={e}>
                {e}
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
