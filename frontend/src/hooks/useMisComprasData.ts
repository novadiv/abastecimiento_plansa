import { useEffect, useState } from 'react';
import {
  fetchConsolidadoProducto,
  fetchRequerimientosKpis,
  fetchRequerimientosLista,
  fetchStatsOC,
} from '@/services/requerimientosService';
import { buildProductosFrecuentes, countProveedoresDistintos } from '@/utils/comprasFrecuentes';
import type {
  ConsolidadoProductoKpis,
  MisComprasFilters,
  ProductoFrecuente,
  RequerimientoItem,
  RequerimientosKpis,
  StatsOC,
} from '@/types/requerimiento';

const CONSOLIDADO_LIMIT = 50;
const HISTORIAL_LIMIT = 25;

interface KpisState {
  kpis: RequerimientosKpis | null;
  statsOC: StatsOC | null;
  loading: boolean;
  error: string | null;
}

interface ConsolidadoState {
  productos: ProductoFrecuente[];
  proveedoresDistintosVisibles: number;
  totalProductos: number;
  pages: number;
  kpis: ConsolidadoProductoKpis | null;
  loading: boolean;
  error: string | null;
}

interface HistorialState {
  items: RequerimientoItem[];
  total: number;
  pages: number;
  loading: boolean;
  error: string | null;
}

/** Datos de "Mis Compras" que sí reaccionan a los filtros elegidos (a diferencia de useFixedPeriodKpis). */
export function useMisComprasData(responsable: string | null, filters: MisComprasFilters) {
  const [kpisState, setKpisState] = useState<KpisState>({ kpis: null, statsOC: null, loading: true, error: null });
  const [consolidadoPage, setConsolidadoPage] = useState(1);
  const [consolidadoState, setConsolidadoState] = useState<ConsolidadoState>({
    productos: [],
    proveedoresDistintosVisibles: 0,
    totalProductos: 0,
    pages: 1,
    kpis: null,
    loading: true,
    error: null,
  });
  const [historialPage, setHistorialPage] = useState(1);
  const [historialState, setHistorialState] = useState<HistorialState>({
    items: [],
    total: 0,
    pages: 1,
    loading: true,
    error: null,
  });

  // Cualquier cambio de filtro regresa las tablas paginadas a la página 1.
  useEffect(() => {
    setConsolidadoPage(1);
    setHistorialPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responsable, JSON.stringify(filters)]);

  useEffect(() => {
    if (!responsable) {
      setKpisState({ kpis: null, statsOC: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setKpisState((prev) => ({ ...prev, loading: true, error: null }));
    Promise.all([fetchRequerimientosKpis(responsable, filters), fetchStatsOC(responsable, filters)])
      .then(([kpis, statsOC]) => {
        if (!cancelled) setKpisState({ kpis, statsOC, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled) setKpisState({ kpis: null, statsOC: null, loading: false, error: 'No fue posible cargar los KPIs de Mis Compras.' });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responsable, JSON.stringify(filters)]);

  useEffect(() => {
    if (!responsable) {
      setConsolidadoState({ productos: [], proveedoresDistintosVisibles: 0, totalProductos: 0, pages: 1, kpis: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setConsolidadoState((prev) => ({ ...prev, loading: true, error: null }));
    fetchConsolidadoProducto(responsable, filters, consolidadoPage, CONSOLIDADO_LIMIT)
      .then((response) => {
        if (cancelled) return;
        setConsolidadoState({
          productos: buildProductosFrecuentes(response.data),
          proveedoresDistintosVisibles: countProveedoresDistintos(response.data),
          totalProductos: response.total,
          pages: response.pages,
          kpis: response.kpis,
          loading: false,
          error: null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setConsolidadoState((prev) => ({ ...prev, loading: false, error: 'No fue posible cargar tus productos frecuentes.' }));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responsable, JSON.stringify(filters), consolidadoPage]);

  useEffect(() => {
    if (!responsable) {
      setHistorialState({ items: [], total: 0, pages: 1, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setHistorialState((prev) => ({ ...prev, loading: true, error: null }));
    fetchRequerimientosLista(responsable, filters, historialPage, HISTORIAL_LIMIT)
      .then((response) => {
        if (cancelled) return;
        setHistorialState({ items: response.data, total: response.total, pages: response.pages, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled) {
          setHistorialState((prev) => ({ ...prev, loading: false, error: 'No fue posible cargar tu historial de requerimientos.' }));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responsable, JSON.stringify(filters), historialPage]);

  return {
    ...kpisState,
    consolidado: { ...consolidadoState, page: consolidadoPage, limit: CONSOLIDADO_LIMIT },
    setConsolidadoPage,
    historial: { ...historialState, page: historialPage },
    setHistorialPage,
  };
}

export type UseMisComprasDataReturn = ReturnType<typeof useMisComprasData>;
