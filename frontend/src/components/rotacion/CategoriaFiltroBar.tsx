import { useRotacionContext } from '@/context/RotacionContext';
import type { CategoriaRotacion } from '@/types/rotacion';

const OPCIONES: { value: CategoriaRotacion; label: string }[] = [
  { value: 'activos', label: 'Activos' },
  { value: 'estacionales', label: 'Estacionales' },
  { value: 'bajaRotacion', label: 'Baja Rotación' },
];

/**
 * Filtro rápido por checkboxes: acumulativo (unión), no excluyente. Marcar
 * varias categorías las combina en una sola vista (tabla, gráficos y KPIs se
 * recalculan sobre la unión) — no hace falta cambiar de sección para verlas
 * juntas.
 */
export function CategoriaFiltroBar() {
  const { filters, updateFilters } = useRotacionContext();
  const seleccionadas = filters.categorias ?? [];
  const todasSeleccionadas = OPCIONES.every((o) => seleccionadas.includes(o.value));

  function toggle(value: CategoriaRotacion) {
    const next = seleccionadas.includes(value) ? seleccionadas.filter((v) => v !== value) : [...seleccionadas, value];
    updateFilters({ categorias: next.length > 0 ? next : undefined });
  }

  function toggleTodos() {
    updateFilters({ categorias: todasSeleccionadas ? undefined : OPCIONES.map((o) => o.value) });
  }

  return (
    <div className="card p-4">
      <p className="mb-3 text-sm font-semibold text-slate-800">Ver materiales por categoría</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={todasSeleccionadas}
            onChange={toggleTodos}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
          />
          Seleccionar todos
        </label>

        <span className="hidden h-5 w-px bg-slate-200 sm:block" />

        {OPCIONES.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={seleccionadas.includes(o.value)}
              onChange={() => toggle(o.value)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            />
            {o.label}
          </label>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {seleccionadas.length === 0
          ? 'Sin selección: se muestran todos los materiales (sin restricción de esta categoría).'
          : 'Se muestran los materiales que pertenecen a cualquiera de las categorías marcadas (unión) — desmarca una para quitarla de la vista.'}
      </p>
    </div>
  );
}
