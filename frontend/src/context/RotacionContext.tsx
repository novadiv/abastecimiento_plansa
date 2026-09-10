import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRotacionCatalog } from '@/hooks/useRotacionCatalog';
import { useRotacionConfig } from '@/hooks/useRotacionConfig';
import { applyRotacionFilters, reclassify } from '@/utils/rotacionCalculations';
import {
  buildAlertas,
  buildComparacionPorNivel,
  buildComparacionSuministrosRepuestos,
  buildPanoramaEjecutivo,
  buildRotacionCharts,
  buildRotacionKpis,
} from '@/utils/rotacionInsights';
import type { CargaProgreso, ProductoRotacion, RotacionConfig, RotacionFilters } from '@/types/rotacion';
import type { ChartConfig, KPIDefinition } from '@/types/dashboard';
import type { AlertaRotacion, GrupoComparacion } from '@/utils/rotacionInsights';

interface RotacionContextValue {
  loading: boolean;
  progress: CargaProgreso | null;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => void;

  config: RotacionConfig;
  updateConfig: (patch: Partial<RotacionConfig>) => void;
  resetConfig: () => void;

  filters: RotacionFilters;
  updateFilters: (patch: Partial<RotacionFilters>) => void;
  clearFilters: () => void;

  /** Catálogo completo, re-clasificado con los umbrales vigentes (sin filtrar). */
  catalogo: ProductoRotacion[];
  /** Catálogo con los filtros del usuario aplicados — lo que consumen tablas/KPIs/gráficos. */
  materiales: ProductoRotacion[];

  kpis: KPIDefinition[];
  comparacionPorNivel: GrupoComparacion[];
  comparacionSuministrosRepuestos: GrupoComparacion[];
  alertas: AlertaRotacion[];
  panorama: string[];
  charts: ChartConfig[];

  familiasDisponibles: string[];
  areasDisponibles: string[];
  proveedoresDisponibles: string[];

  codigoSeleccionado: string | null;
  seleccionarMaterial: (codigo: string) => void;
  cerrarDetalle: () => void;
}

const RotacionContext = createContext<RotacionContextValue | null>(null);

const EMPTY_FILTERS: RotacionFilters = {};

export function RotacionProvider({ children }: { children: ReactNode }) {
  const { materiales: rawCatalogo, loading, progress, error, lastUpdated, refresh } = useRotacionCatalog();
  const { config, updateConfig, resetConfig } = useRotacionConfig();
  const [filters, setFilters] = useState<RotacionFilters>(EMPTY_FILTERS);
  const [codigoSeleccionado, setCodigoSeleccionado] = useState<string | null>(null);

  const catalogo = useMemo(() => reclassify(rawCatalogo, config), [rawCatalogo, config]);
  const materiales = useMemo(() => applyRotacionFilters(catalogo, filters, config), [catalogo, filters, config]);

  const kpis = useMemo(() => buildRotacionKpis(materiales, config), [materiales, config]);
  const comparacionPorNivel = useMemo(() => buildComparacionPorNivel(materiales), [materiales]);
  const comparacionSuministrosRepuestos = useMemo(() => buildComparacionSuministrosRepuestos(materiales), [materiales]);
  const alertas = useMemo(() => buildAlertas(materiales, config), [materiales, config]);
  const panorama = useMemo(() => buildPanoramaEjecutivo(materiales, config), [materiales, config]);
  const charts = useMemo(() => buildRotacionCharts(materiales), [materiales]);

  const familiasDisponibles = useMemo(
    () => Array.from(new Set(catalogo.map((m) => m.familia).filter((f): f is string => Boolean(f)))).sort(),
    [catalogo],
  );
  const areasDisponibles = useMemo(
    () => Array.from(new Set(catalogo.map((m) => m.areaPrincipal).filter((f): f is string => Boolean(f)))).sort(),
    [catalogo],
  );
  const proveedoresDisponibles = useMemo(
    () => Array.from(new Set(catalogo.map((m) => m.proveedorPrincipal).filter((f): f is string => Boolean(f)))).sort(),
    [catalogo],
  );

  function updateFilters(patch: Partial<RotacionFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  const value: RotacionContextValue = {
    loading,
    progress,
    error,
    lastUpdated,
    refresh,
    config,
    updateConfig,
    resetConfig,
    filters,
    updateFilters,
    clearFilters,
    catalogo,
    materiales,
    kpis,
    comparacionPorNivel,
    comparacionSuministrosRepuestos,
    alertas,
    panorama,
    charts,
    familiasDisponibles,
    areasDisponibles,
    proveedoresDisponibles,
    codigoSeleccionado,
    seleccionarMaterial: setCodigoSeleccionado,
    cerrarDetalle: () => setCodigoSeleccionado(null),
  };

  return <RotacionContext.Provider value={value}>{children}</RotacionContext.Provider>;
}

export function useRotacionContext(): RotacionContextValue {
  const ctx = useContext(RotacionContext);
  if (!ctx) throw new Error('useRotacionContext debe usarse dentro de un RotacionProvider');
  return ctx;
}
