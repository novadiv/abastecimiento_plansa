import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { usePanoramaMateriales } from '@/hooks/usePanoramaMateriales';
import { applyPanoramaFilters, buildPanoramaKpis, type PanoramaKpis } from '@/utils/panoramaCalculations';
import { buildPanoramaCharts, buildPanoramaKpiCards } from '@/utils/panoramaInsights';
import type { MaterialPanorama, PanoramaFilters, PanoramaProgreso } from '@/types/panorama';
import type { ChartConfig, KPIDefinition } from '@/types/dashboard';

export type AnioFiltro = number | 'todos';

interface PanoramaContextValue {
  loading: boolean;
  progress: PanoramaProgreso | null;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => void;

  anioSeleccionado: AnioFiltro;
  setAnio: (anio: AnioFiltro) => void;
  aniosDisponibles: number[];

  filters: PanoramaFilters;
  updateFilters: (patch: Partial<PanoramaFilters>) => void;
  clearFilters: () => void;

  /** Catálogo completo del responsable (sin filtrar). */
  catalogo: MaterialPanorama[];
  /** Catálogo con los filtros/checkboxes aplicados — lo que consumen tabla/KPIs/gráficos. */
  materiales: MaterialPanorama[];

  kpis: PanoramaKpis;
  kpiCards: KPIDefinition[];
  charts: ChartConfig[];
  familiasDisponibles: string[];

  codigoSeleccionado: string | null;
  seleccionarMaterial: (codigo: string) => void;
  cerrarDetalle: () => void;
}

const PanoramaContext = createContext<PanoramaContextValue | null>(null);

const EMPTY_FILTERS: PanoramaFilters = {};

const ANIO_ACTUAL = new Date().getFullYear();

export function PanoramaProvider({ responsable, children }: { responsable: string | null; children: ReactNode }) {
  // Por defecto "todos" (la clasificación de rotación/estacionalidad se
  // beneficia de ver el historial completo) — el usuario puede acotar a un
  // año puntual si lo prefiere.
  const [anioSeleccionado, setAnio] = useState<AnioFiltro>('todos');
  const anioParaFetch = anioSeleccionado === 'todos' ? undefined : anioSeleccionado;
  const { materiales: catalogo, loading, progress, error, lastUpdated, refresh } = usePanoramaMateriales(responsable, anioParaFetch);
  const [filters, setFilters] = useState<PanoramaFilters>(EMPTY_FILTERS);
  const [codigoSeleccionado, setCodigoSeleccionado] = useState<string | null>(null);
  const aniosDisponibles = [ANIO_ACTUAL, ANIO_ACTUAL - 1, ANIO_ACTUAL - 2];

  const materiales = useMemo(() => applyPanoramaFilters(catalogo, filters), [catalogo, filters]);
  const kpis = useMemo(() => buildPanoramaKpis(catalogo), [catalogo]);
  const kpiCards = useMemo(() => buildPanoramaKpiCards(kpis), [kpis]);
  const charts = useMemo(() => buildPanoramaCharts(materiales), [materiales]);
  const familiasDisponibles = useMemo(
    () => Array.from(new Set(catalogo.map((m) => m.familia).filter((f): f is string => Boolean(f)))).sort(),
    [catalogo],
  );

  function updateFilters(patch: Partial<PanoramaFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  const value: PanoramaContextValue = {
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
    kpis,
    kpiCards,
    charts,
    familiasDisponibles,
    codigoSeleccionado,
    seleccionarMaterial: setCodigoSeleccionado,
    cerrarDetalle: () => setCodigoSeleccionado(null),
  };

  return <PanoramaContext.Provider value={value}>{children}</PanoramaContext.Provider>;
}

export function usePanoramaContext(): PanoramaContextValue {
  const ctx = useContext(PanoramaContext);
  if (!ctx) throw new Error('usePanoramaContext debe usarse dentro de un PanoramaProvider');
  return ctx;
}
