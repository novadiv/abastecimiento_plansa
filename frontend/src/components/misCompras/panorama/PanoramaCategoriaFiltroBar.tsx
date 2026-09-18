import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePanoramaContext } from '@/context/PanoramaContext';
import type { PanoramaNivel } from '@/types/panorama';

const CATEGORIAS: { value: PanoramaNivel; label: string }[] = [
  { value: 'alta', label: '🔴 Alta rotación' },
  { value: 'media', label: '🟠 Media rotación' },
  { value: 'estacional', label: '🔵 Estacional' },
  { value: 'baja', label: '🟢 Baja/Poca rotación' },
];

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Filtro por checkboxes ACUMULATIVO (unión, no intersección) — marcar varias
 * categorías las combina en una misma vista, más botones rápidos para los
 * combos de uso más común. Es el equivalente de este módulo al
 * `CategoriaFiltroBar` de "Materiales y Rotación".
 */
export function PanoramaCategoriaFiltroBar() {
  const { filters, updateFilters, familiasDisponibles } = usePanoramaContext();
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const seleccionadas = filters.categorias ?? [];
  const todasSeleccionadas = CATEGORIAS.every((c) => seleccionadas.includes(c.value));

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== (filters.search ?? '')) updateFilters({ search: searchInput || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function toggle(value: PanoramaNivel) {
    const next = seleccionadas.includes(value) ? seleccionadas.filter((v) => v !== value) : [...seleccionadas, value];
    updateFilters({ categorias: next.length > 0 ? next : undefined, soloParaComprar: undefined });
  }

  function toggleTodos() {
    updateFilters({ categorias: todasSeleccionadas ? undefined : CATEGORIAS.map((c) => c.value), soloParaComprar: undefined });
  }

  function handleClear() {
    setSearchInput('');
    updateFilters({ categorias: undefined, familia: undefined, search: undefined, soloParaComprar: undefined });
  }

  const hasActiveFilters = Boolean(
    (filters.categorias && filters.categorias.length > 0) || filters.familia || filters.search || filters.soloParaComprar,
  );

  return (
    <div className="card space-y-4 p-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">Ver materiales por categoría</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={todasSeleccionadas} onChange={toggleTodos} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
            Seleccionar todos
          </label>
          <span className="hidden h-5 w-px bg-slate-200 sm:block" />
          {CATEGORIAS.map((c) => (
            <label key={c.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={seleccionadas.includes(c.value)}
                onChange={() => toggle(c.value)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <QuickButton label="VER TODOS" active={seleccionadas.length === 0 && !filters.soloParaComprar} onClick={() => updateFilters({ categorias: undefined, soloParaComprar: undefined })} />
        <QuickButton label="SOLO ALTA ROTACIÓN" onClick={() => updateFilters({ categorias: ['alta'], soloParaComprar: undefined })} />
        <QuickButton label="ALTA + MEDIA" onClick={() => updateFilters({ categorias: ['alta', 'media'], soloParaComprar: undefined })} />
        <QuickButton label="ESTACIONALES" onClick={() => updateFilters({ categorias: ['estacional'], soloParaComprar: undefined })} />
        <QuickButton label="BAJA ROTACIÓN" onClick={() => updateFilters({ categorias: ['baja'], soloParaComprar: undefined })} />
        <QuickButton
          label="MATERIALES PARA COMPRAR"
          active={Boolean(filters.soloParaComprar)}
          onClick={() => updateFilters({ categorias: undefined, soloParaComprar: true })}
        />
        <QuickButton label="PLAN DE ABASTECIMIENTO 2 MESES" onClick={() => updateFilters({ categorias: ['alta'], soloParaComprar: undefined })} />
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-slate-100 pt-4">
        <div className="min-w-[220px] flex-1">
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
        <button type="button" onClick={handleClear} className="btn-ghost" disabled={!hasActiveFilters}>
          <X size={14} /> Limpiar filtros
        </button>
      </div>

      <p className="text-[11px] text-slate-400">
        Los checkboxes son acumulativos: marca varias categorías para verlas juntas en una sola vista (unión, no
        intersección). Los botones rápidos son atajos que fijan una combinación común.
      </p>
    </div>
  );
}

function QuickButton({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
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
