import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AnalysisBlock, AnalysisInsight, ChartConfig, KPIDefinition } from '@/types/dashboard';
import type { CatalogoOpcion, DashboardKpis, Producto, ProductosQuery, ProductosTotales } from '@/types/producto';
import { useProductos } from '@/hooks/useProductos';
import { useFamiliasLineas } from '@/hooks/useFamiliasLineas';
import { useDashboardKpis } from '@/hooks/useDashboardKpis';
import { buildAnalysisBlocks, buildAnalysisInsights, buildCharts, buildKpiCards } from '@/utils/apiCalculations';

interface ProductosContextValue {
  query: ProductosQuery;
  productos: Producto[];
  total: number;
  pages: number;
  totales: ProductosTotales | null;
  loading: boolean;
  error: string | null;
  updateFilters: (patch: Partial<Omit<ProductosQuery, 'page'>>) => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setSort: (sortBy: string, sortOrder: 1 | -1) => void;
  clearFilters: () => void;
  refetch: () => void;

  familias: CatalogoOpcion[];
  lineas: CatalogoOpcion[];

  dashboardKpis: DashboardKpis | null;
  dashboardKpisLoading: boolean;
  refetchDashboardKpis: () => void;

  kpis: KPIDefinition[];
  charts: ChartConfig[];
  insights: AnalysisInsight[];
  analysisBlocks: AnalysisBlock[];
}

const ProductosContext = createContext<ProductosContextValue | null>(null);

export function ProductosProvider({ children }: { children: ReactNode }) {
  const productosState = useProductos();
  const { familias, lineas } = useFamiliasLineas(productosState.query.familia);
  const { data: dashboardKpis, loading: dashboardKpisLoading, refetch: refetchDashboardKpis } = useDashboardKpis();

  const kpis = useMemo(
    () => buildKpiCards(productosState.totales, dashboardKpis, productosState.total),
    [productosState.totales, dashboardKpis, productosState.total],
  );
  const charts = useMemo(
    () => buildCharts(productosState.totales, familias),
    [productosState.totales, familias],
  );
  const insights = useMemo(
    () => buildAnalysisInsights(productosState.totales, familias, productosState.total),
    [productosState.totales, familias, productosState.total],
  );
  const analysisBlocks = useMemo(
    () => buildAnalysisBlocks(productosState.totales),
    [productosState.totales],
  );

  const value: ProductosContextValue = {
    ...productosState,
    familias,
    lineas,
    dashboardKpis,
    dashboardKpisLoading,
    refetchDashboardKpis,
    kpis,
    charts,
    insights,
    analysisBlocks,
  };

  return <ProductosContext.Provider value={value}>{children}</ProductosContext.Provider>;
}

export function useProductosContext(): ProductosContextValue {
  const ctx = useContext(ProductosContext);
  if (!ctx) throw new Error('useProductosContext debe usarse dentro de un ProductosProvider');
  return ctx;
}
