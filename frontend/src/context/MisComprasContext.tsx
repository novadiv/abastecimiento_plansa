import { createContext, useContext, type ReactNode } from 'react';
import { useResponsable } from '@/hooks/useResponsable';
import { useMisComprasFilters, type UseMisComprasFiltersReturn } from '@/hooks/useMisComprasFilters';
import { useMisComprasData, type UseMisComprasDataReturn } from '@/hooks/useMisComprasData';
import { useFixedPeriodKpis } from '@/hooks/useFixedPeriodKpis';
import { useRequerimientosFiltros } from '@/hooks/useRequerimientosFiltros';
import type { RequerimientosFiltrosOptions, RequerimientosKpis } from '@/types/requerimiento';

interface MisComprasContextValue {
  responsable: string | null;
  usuario: string | null;
  filtrosDisponibles: RequerimientosFiltrosOptions;
  filters: UseMisComprasFiltersReturn['filters'];
  updateFilters: UseMisComprasFiltersReturn['updateFilters'];
  clearFilters: UseMisComprasFiltersReturn['clearFilters'];
  data: UseMisComprasDataReturn;
  kpisMesActual: RequerimientosKpis | null;
  kpisAñoActual: RequerimientosKpis | null;
  loadingPeriodoFijo: boolean;
}

const MisComprasContext = createContext<MisComprasContextValue | null>(null);

export function MisComprasProvider({ children }: { children: ReactNode }) {
  const { responsable, usuario } = useResponsable();
  const { filters, updateFilters, clearFilters } = useMisComprasFilters();
  const data = useMisComprasData(responsable, filters);
  const { mesActual, añoActual, loading: loadingPeriodoFijo } = useFixedPeriodKpis(responsable);
  const filtrosDisponibles = useRequerimientosFiltros();

  const value: MisComprasContextValue = {
    responsable,
    usuario,
    filtrosDisponibles,
    filters,
    updateFilters,
    clearFilters,
    data,
    kpisMesActual: mesActual,
    kpisAñoActual: añoActual,
    loadingPeriodoFijo,
  };

  return <MisComprasContext.Provider value={value}>{children}</MisComprasContext.Provider>;
}

export function useMisComprasContext(): MisComprasContextValue {
  const ctx = useContext(MisComprasContext);
  if (!ctx) throw new Error('useMisComprasContext debe usarse dentro de un MisComprasProvider');
  return ctx;
}
