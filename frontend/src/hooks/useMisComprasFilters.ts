import { useCallback, useState } from 'react';
import type { MisComprasFilters } from '@/types/requerimiento';

const EMPTY_FILTERS: MisComprasFilters = {};

/** Estado de los filtros de "Mis Compras". El filtro de responsable/usuario
 * NO vive aquí: se fija por fuera, a partir de la sesión (ver useResponsable). */
export function useMisComprasFilters() {
  const [filters, setFilters] = useState<MisComprasFilters>(EMPTY_FILTERS);

  const updateFilters = useCallback((patch: Partial<MisComprasFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  return { filters, updateFilters, clearFilters };
}

export type UseMisComprasFiltersReturn = ReturnType<typeof useMisComprasFilters>;
