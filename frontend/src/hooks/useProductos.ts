import { useCallback, useEffect, useState } from 'react';
import { fetchProductos } from '@/services/productosService';
import { ApiError } from '@/services/apiClient';
import { DEFAULT_PRODUCTOS_QUERY, type ProductosQuery, type ProductosResponse } from '@/types/producto';

interface ProductosState {
  response: ProductosResponse | null;
  loading: boolean;
  error: string | null;
}

/** Filtros que, al cambiar, deben regresar a la página 1 (cualquier cambio
 * que no sea "cambiar de página" o "cambiar de orden"). */
type FilterPatch = Partial<Omit<ProductosQuery, 'page'>>;

export function useProductos() {
  const [query, setQuery] = useState<ProductosQuery>(DEFAULT_PRODUCTOS_QUERY);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ProductosState>({ response: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchProductos(query)
      .then((response) => {
        if (cancelled) return;
        setState({ response, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : 'No fue posible cargar los productos.';
        setState({ response: null, loading: false, error: message });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, reloadKey]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  const updateFilters = useCallback((patch: FilterPatch) => {
    setQuery((prev) => ({ ...prev, ...patch, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setQuery((prev) => ({ ...prev, page }));
  }, []);

  const setLimit = useCallback((limit: number) => {
    setQuery((prev) => ({ ...prev, limit, page: 1 }));
  }, []);

  const setSort = useCallback((sort_by: string, sort_order: 1 | -1) => {
    setQuery((prev) => ({ ...prev, sort_by, sort_order }));
  }, []);

  const clearFilters = useCallback(() => {
    setQuery((prev) => ({ ...DEFAULT_PRODUCTOS_QUERY, limit: prev.limit }));
  }, []);

  return {
    query,
    productos: state.response?.data ?? [],
    total: state.response?.total ?? 0,
    pages: state.response?.pages ?? 1,
    totales: state.response?.totales ?? null,
    loading: state.loading,
    error: state.error,
    updateFilters,
    setPage,
    setLimit,
    setSort,
    clearFilters,
    refetch,
  };
}

export type UseProductosReturn = ReturnType<typeof useProductos>;
