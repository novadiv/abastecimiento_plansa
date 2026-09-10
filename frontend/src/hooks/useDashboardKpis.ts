import { useCallback, useEffect, useState } from 'react';
import { fetchDashboardKpis } from '@/services/productosService';
import type { DashboardKpis } from '@/types/producto';

interface State {
  data: DashboardKpis | null;
  loading: boolean;
  error: string | null;
}

/** KPIs globales del sistema (`/api/dashboard/kpis`) — no dependen de los filtros de la tabla. */
export function useDashboardKpis() {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  const refetch = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchDashboardKpis()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch(() => setState({ data: null, loading: false, error: 'No fue posible cargar los KPIs globales.' }));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ...state, refetch };
}
