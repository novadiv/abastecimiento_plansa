import { useEffect, useState } from 'react';
import { fetchRequerimientosKpis } from '@/services/requerimientosService';
import type { RequerimientosKpis } from '@/types/requerimiento';

interface State {
  mesActual: RequerimientosKpis | null;
  añoActual: RequerimientosKpis | null;
  loading: boolean;
}

/** KPIs de "mes actual" y "año actual", fijos — no cambian con los filtros que el usuario elija. */
export function useFixedPeriodKpis(responsable: string | null) {
  const [state, setState] = useState<State>({ mesActual: null, añoActual: null, loading: true });

  useEffect(() => {
    if (!responsable) {
      setState({ mesActual: null, añoActual: null, loading: false });
      return;
    }

    const now = new Date();
    const año = now.getFullYear();
    const mes = now.getMonth() + 1;

    setState((prev) => ({ ...prev, loading: true }));
    Promise.all([
      fetchRequerimientosKpis(responsable, { año, mes }),
      fetchRequerimientosKpis(responsable, { año }),
    ])
      .then(([mesActual, añoActual]) => setState({ mesActual, añoActual, loading: false }))
      .catch(() => setState({ mesActual: null, añoActual: null, loading: false }));
  }, [responsable]);

  return state;
}
