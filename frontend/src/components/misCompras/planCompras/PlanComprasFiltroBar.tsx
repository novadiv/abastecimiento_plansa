import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { usePlanComprasContext } from '@/context/PlanComprasContext';
import type { EstadoMaterialPlan, TandaCompra } from '@/types/planCompras';
import type { PanoramaNivel } from '@/types/panorama';

const ESTADOS: { value: EstadoMaterialPlan; label: string }[] = [
  { value: 'pendiente', label: '🔴 Pendiente de OC' },
  { value: 'parcial', label: '🟡 Parcialmente atendido' },
  { value: 'consolidable', label: '🔵 Consolidable' },
];

const NIVELES: { value: PanoramaNivel; label: string }[] = [
  { value: 'alta', label: '🔴 Alta rotación' },
  { value: 'media', label: '🟠 Media rotación' },
  { value: 'estacional', label: '🔵 Estacional' },
  { value: 'baja', label: '🟢 Baja rotación' },
];

const SEARCH_DEBOUNCE_MS = 300;

/** Filtros combinables (sección 9): proveedor, estado, rotación/comportamiento, tanda de urgencia. */
export function PlanComprasFiltroBar() {
  const { filters, updateFilters, clearFilters, proveedoresDisponibles } = usePlanComprasContext();
  const [searchInput, setSearchInput] = useState(filters.search ?? '');

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== (filters.search ?? '')) updateFilters({ search: searchInput || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function toggleProveedor(p: string) {
    const actual = filters.proveedores ?? [];
    const next = actual.includes(p) ? actual.filter((v) => v !== p) : [...actual, p];
    updateFilters({ proveedores: next.length > 0 ? next : undefined });
  }

  function toggleEstado(e: EstadoMaterialPlan) {
    const actual = filters.estados ?? [];
    const next = actual.includes(e) ? actual.filter((v) => v !== e) : [...actual, e];
    updateFilters({ estados: next.length > 0 ? next : undefined });
  }

  function toggleNivel(n: PanoramaNivel) {
    const actual = filters.niveles ?? [];
    const next = actual.includes(n) ? actual.filter((v) => v !== n) : [...actual, n];
    updateFilters({ niveles: next.length > 0 ? next : undefined });
  }

  function handleClear() {
    setSearchInput('');
    clearFilters();
  }

  const hasActiveFilters = Boolean(
    (filters.proveedores && filters.proveedores.length > 0) ||
      (filters.estados && filters.estados.length > 0) ||
      (filters.niveles && filters.niveles.length > 0) ||
      filters.tanda ||
      filters.search,
  );

  return (
    <div className="card space-y-4 p-4">
      <div className="min-w-[220px]">
        <label className="label-text">Buscar código / descripción</label>
        <div className="relative max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar..." className="input pl-8" />
        </div>
      </div>

      <div>
        <p className="label-text mb-1.5">Comprador</p>
        <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          ☑ JCAMACHO (fijo — esta vista siempre está scoped a tu usuario)
        </span>
      </div>

      <div>
        <p className="label-text mb-1.5">Estado</p>
        <div className="flex flex-wrap gap-3">
          {ESTADOS.map((e) => (
            <label key={e.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={(filters.estados ?? []).includes(e.value)}
                onChange={() => toggleEstado(e.value)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              {e.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="label-text mb-1.5">Rotación / comportamiento</p>
        <div className="flex flex-wrap gap-3">
          {NIVELES.map((n) => (
            <label key={n.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={(filters.niveles ?? []).includes(n.value)}
                onChange={() => toggleNivel(n.value)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              {n.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="label-text mb-1.5">Urgencia de compra</p>
        <div className="flex flex-wrap gap-2">
          <TandaButton label="Todos" active={!filters.tanda} onClick={() => updateFilters({ tanda: undefined })} />
          <TandaButton label="⚠️ Cuanto antes" active={filters.tanda === 'urgente'} onClick={() => updateFilters({ tanda: 'urgente' as TandaCompra })} />
          <TandaButton label="📅 Programada" active={filters.tanda === 'programada'} onClick={() => updateFilters({ tanda: 'programada' as TandaCompra })} />
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          No existe un campo de "fecha requerida" futura en el sistema — la urgencia se calcula con `días pendientes`
          real: 30+ días esperando = "cuanto antes".
        </p>
      </div>

      <div>
        <p className="label-text mb-1.5">Proveedor</p>
        <div className="flex flex-wrap gap-2">
          <TandaButton label="Todos" active={!filters.proveedores || filters.proveedores.length === 0} onClick={() => updateFilters({ proveedores: undefined })} />
          {proveedoresDisponibles.map((p) => (
            <label key={p} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={(filters.proveedores ?? []).includes(p)}
                onChange={() => toggleProveedor(p)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              {p}
            </label>
          ))}
        </div>
      </div>

      <button type="button" onClick={handleClear} className="btn-ghost" disabled={!hasActiveFilters}>
        <X size={14} /> Limpiar filtros
      </button>
    </div>
  );
}

function TandaButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}
