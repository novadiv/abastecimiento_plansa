import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { usePlanCompras } from '@/hooks/usePlanCompras';
import {
  applyPlanComprasFilters,
  buildMaterialesRepetidos,
  buildPlanComprasResumen,
  buildPlanPorProveedor,
  soloConNecesidadDeCompra,
} from '@/utils/planComprasCalculations';
import type { MaterialPlanCompras, PlanComprasFilters, PlanComprasResumen, PlanProveedor } from '@/types/planCompras';
import type { PanoramaProgreso } from '@/types/panorama';
import type { PeriodoFiltro } from '@/utils/filtroAnio';

export type AnioFiltro = PeriodoFiltro;

interface PlanComprasContextValue {
  loading: boolean;
  progress: PanoramaProgreso | null;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => void;

  anioSeleccionado: AnioFiltro;
  setAnio: (anio: AnioFiltro) => void;
  aniosDisponibles: number[];

  filters: PlanComprasFilters;
  updateFilters: (patch: Partial<PlanComprasFilters>) => void;
  clearFilters: () => void;

  /** Todos los materiales del responsable (para KPIs/resumen globales, sin filtrar). */
  catalogo: MaterialPlanCompras[];
  /** Solo los que hay que comprar (pendiente/parcial), con filtros del usuario aplicados. */
  materiales: MaterialPlanCompras[];
  materialesRepetidos: MaterialPlanCompras[];
  proveedores: PlanProveedor[];
  resumen: PlanComprasResumen;

  proveedoresDisponibles: string[];
}

const PlanComprasContext = createContext<PlanComprasContextValue | null>(null);

const EMPTY_FILTERS: PlanComprasFilters = {};

const ANIO_ACTUAL = new Date().getFullYear();

export function PlanComprasProvider({ responsable, children }: { responsable: string | null; children: ReactNode }) {
  // Por defecto "últimos 3 meses" (horizonte real de planificación pedido) —
  // el usuario puede cambiarlo a un año puntual o a "todos" desde el selector.
  const [anioSeleccionado, setAnio] = useState<AnioFiltro>('ultimos-3-meses');
  const { materiales: catalogo, loading, progress, error, lastUpdated, refresh } = usePlanCompras(responsable, anioSeleccionado);
  const [filters, setFilters] = useState<PlanComprasFilters>(EMPTY_FILTERS);
  const aniosDisponibles = [ANIO_ACTUAL, ANIO_ACTUAL - 1, ANIO_ACTUAL - 2];

  const conNecesidad = useMemo(() => soloConNecesidadDeCompra(catalogo), [catalogo]);
  const materiales = useMemo(() => applyPlanComprasFilters(conNecesidad, filters), [conNecesidad, filters]);
  const proveedores = useMemo(() => buildPlanPorProveedor(materiales), [materiales]);
  const materialesRepetidos = useMemo(() => buildMaterialesRepetidos(materiales), [materiales]);
  const resumen = useMemo(() => buildPlanComprasResumen(catalogo, buildPlanPorProveedor(soloConNecesidadDeCompra(catalogo))), [catalogo]);

  const proveedoresDisponibles = useMemo(
    () => Array.from(new Set(conNecesidad.map((m) => m.proveedorSugerido).filter((p): p is string => Boolean(p)))).sort(),
    [conNecesidad],
  );

  function updateFilters(patch: Partial<PlanComprasFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  const value: PlanComprasContextValue = {
    loading,
    progress,
    error,
    lastUpdated,
    refresh,
    anioSeleccionado,
    setAnio,
    aniosDisponibles,
    filters,
    updateFilters,
    clearFilters,
    catalogo,
    materiales,
    materialesRepetidos,
    proveedores,
    resumen,
    proveedoresDisponibles,
  };

  return <PlanComprasContext.Provider value={value}>{children}</PlanComprasContext.Provider>;
}

export function usePlanComprasContext(): PlanComprasContextValue {
  const ctx = useContext(PlanComprasContext);
  if (!ctx) throw new Error('usePlanComprasContext debe usarse dentro de un PlanComprasProvider');
  return ctx;
}
