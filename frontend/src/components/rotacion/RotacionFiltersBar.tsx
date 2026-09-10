import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useRotacionContext } from '@/context/RotacionContext';
import type { EstadoMaterial, RotacionNivel, TipoMaterial } from '@/types/rotacion';

const NIVELES: { value: RotacionNivel; label: string }[] = [
  { value: 'alta', label: '🔴 Alta rotación' },
  { value: 'media', label: '🟡 Media rotación' },
  { value: 'baja', label: '⚪ Baja rotación' },
  { value: 'sinRotacion', label: '⚫ Sin rotación' },
];

const TIPOS: { value: TipoMaterial; label: string }[] = [
  { value: 'suministro', label: 'Suministros' },
  { value: 'repuesto', label: 'Repuestos' },
  { value: 'otro', label: 'Otros' },
];

const ESTADOS: { value: EstadoMaterial; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
];

const SEARCH_DEBOUNCE_MS = 350;

export function RotacionFiltersBar() {
  const { filters, updateFilters, clearFilters, familiasDisponibles, areasDisponibles, proveedoresDisponibles } =
    useRotacionContext();
  const [searchInput, setSearchInput] = useState(filters.search ?? '');

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== (filters.search ?? '')) updateFilters({ search: searchInput || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const hasActiveFilters = Boolean(
    filters.familia ||
      filters.areaPrincipal ||
      filters.proveedorPrincipal ||
      filters.nivel ||
      filters.tipoMaterial ||
      filters.estado ||
      filters.soloEstacionales ||
      filters.fechaDesde ||
      filters.fechaHasta ||
      filters.search ||
      (filters.categorias && filters.categorias.length > 0),
  );

  function handleClear() {
    setSearchInput('');
    clearFilters();
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1">
          <label className="label-text">Buscar código / descripción</label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar..." className="input pl-8" />
          </div>
        </div>

        <div className="w-52">
          <label className="label-text">Familia / categoría</label>
          <select value={filters.familia ?? ''} onChange={(e) => updateFilters({ familia: e.target.value || undefined })} className="input">
            <option value="">Todas</option>
            {familiasDisponibles.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div className="w-40">
          <label className="label-text">Tipo</label>
          <select
            value={filters.tipoMaterial ?? ''}
            onChange={(e) => updateFilters({ tipoMaterial: (e.target.value as TipoMaterial) || undefined })}
            className="input"
          >
            <option value="">Todos</option>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-48">
          <label className="label-text">Área principal</label>
          <select
            value={filters.areaPrincipal ?? ''}
            onChange={(e) => updateFilters({ areaPrincipal: e.target.value || undefined })}
            className="input"
          >
            <option value="">Todas</option>
            {areasDisponibles.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="w-52">
          <label className="label-text">Proveedor principal</label>
          <select
            value={filters.proveedorPrincipal ?? ''}
            onChange={(e) => updateFilters({ proveedorPrincipal: e.target.value || undefined })}
            className="input"
          >
            <option value="">Todos</option>
            {proveedoresDisponibles.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="w-44">
          <label className="label-text">Nivel de rotación</label>
          <select
            value={filters.nivel ?? ''}
            onChange={(e) => updateFilters({ nivel: (e.target.value as RotacionNivel) || undefined })}
            className="input"
          >
            <option value="">Todos</option>
            {NIVELES.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-36">
          <label className="label-text">Estado</label>
          <select
            value={filters.estado ?? ''}
            onChange={(e) => updateFilters({ estado: (e.target.value as EstadoMaterial) || undefined })}
            className="input"
          >
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-36">
          <label className="label-text">Movimiento desde</label>
          <input
            type="date"
            value={filters.fechaDesde ?? ''}
            onChange={(e) => updateFilters({ fechaDesde: e.target.value || undefined })}
            className="input"
          />
        </div>

        <div className="w-36">
          <label className="label-text">Movimiento hasta</label>
          <input
            type="date"
            value={filters.fechaHasta ?? ''}
            onChange={(e) => updateFilters({ fechaHasta: e.target.value || undefined })}
            className="input"
          />
        </div>

        <label className="flex items-center gap-2 pb-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={filters.soloEstacionales ?? false}
            onChange={(e) => updateFilters({ soloEstacionales: e.target.checked || undefined })}
            className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
          />
          📅 Solo estacionales
        </label>

        <button type="button" onClick={handleClear} className="btn-ghost" disabled={!hasActiveFilters}>
          <X size={14} /> Limpiar filtros
        </button>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        "Área principal" y "Proveedor principal" son el área/proveedor más frecuente de cada material (no un filtro por
        transacción individual). "Movimiento desde/hasta" filtra materiales cuyo periodo de actividad (primer→último
        movimiento) se solapa con el rango elegido — ver README para el detalle de estas aproximaciones.
      </p>
    </div>
  );
}
