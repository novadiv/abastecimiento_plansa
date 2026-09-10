import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchConsolidadoGlobalPage } from '@/services/requerimientosService';
import { buildProductoRotacion } from '@/utils/rotacionCalculations';
import { getRotacionConfig } from '@/config/rotacionConfig';
import type { CargaProgreso, ProductoRotacion } from '@/types/rotacion';

const PAGE_LIMIT = 200;
// v2: ProductoRotacion ganó campos nuevos (stockActual, tipoMaterial, estado,
// consumoPorMes, esEstacional...) — se cambia la key para invalidar cachés
// viejas que no los tienen y romperían la UI nueva.
const CACHE_KEY = 'rotacion_catalogo_cache_v2';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas

interface CacheShape {
  materiales: ProductoRotacion[];
  lastUpdated: string;
}

function readCache(): CacheShape | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    const age = Date.now() - new Date(parsed.lastUpdated).getTime();
    if (age > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(materiales: ProductoRotacion[]): string {
  const lastUpdated = new Date().toISOString();
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ materiales, lastUpdated }));
  } catch {
    // Catálogo grande: si excede la cuota de localStorage, sigue funcionando solo en memoria de esta pestaña.
  }
  return lastUpdated;
}

interface State {
  materiales: ProductoRotacion[];
  loading: boolean;
  progress: CargaProgreso | null;
  error: string | null;
  lastUpdated: string | null;
}

/**
 * Trae el catálogo COMPLETO de materiales con movimiento (sin filtrar por
 * responsable) para "Análisis de Rotación". Es una consulta pesada del lado
 * del servidor (~17s por página de 200 materiales, ~14 páginas) — se hace
 * una sola vez, se cachea (memoria + localStorage 24h) y todo el filtrado/
 * ordenamiento posterior ocurre en el cliente sin volver a consultar la API.
 */
export function useRotacionCatalog() {
  const [state, setState] = useState<State>({ materiales: [], loading: true, progress: null, error: null, lastUpdated: null });
  const cancelRef = useRef(false);

  const load = useCallback(async (forceRefresh: boolean) => {
    cancelRef.current = false;

    if (!forceRefresh) {
      const cached = readCache();
      if (cached) {
        setState({ materiales: cached.materiales, loading: false, progress: null, error: null, lastUpdated: cached.lastUpdated });
        return;
      }
    }

    setState((prev) => ({ ...prev, loading: true, error: null, progress: { paginaActual: 0, totalPaginas: 1, materialesTotales: 0 } }));

    try {
      const config = getRotacionConfig();
      const first = await fetchConsolidadoGlobalPage(1, PAGE_LIMIT);
      if (cancelRef.current) return;

      let acumulado: ProductoRotacion[] = first.data.map((r) => buildProductoRotacion(r, config));
      setState((prev) => ({
        ...prev,
        progress: { paginaActual: 1, totalPaginas: first.pages, materialesTotales: first.total },
      }));

      for (let page = 2; page <= first.pages; page += 1) {
        if (cancelRef.current) return;
        // eslint-disable-next-line no-await-in-loop
        const response = await fetchConsolidadoGlobalPage(page, PAGE_LIMIT);
        if (cancelRef.current) return;
        acumulado = acumulado.concat(response.data.map((r) => buildProductoRotacion(r, config)));
        setState((prev) => ({
          ...prev,
          materiales: acumulado,
          progress: { paginaActual: page, totalPaginas: first.pages, materialesTotales: first.total },
        }));
      }

      const lastUpdated = writeCache(acumulado);
      setState({ materiales: acumulado, loading: false, progress: null, error: null, lastUpdated });
    } catch {
      if (!cancelRef.current) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: 'No fue posible cargar el catálogo de rotación. Intenta actualizar nuevamente.',
        }));
      }
    }
  }, []);

  useEffect(() => {
    load(false);
    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => load(true), [load]);

  return { ...state, refresh };
}

export type UseRotacionCatalogReturn = ReturnType<typeof useRotacionCatalog>;
