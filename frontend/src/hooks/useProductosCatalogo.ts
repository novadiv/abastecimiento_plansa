import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProductos } from '@/services/productosService';
import type { CargaProgresoProductos, ProductoResumen } from '@/types/producto';
import { DEFAULT_PRODUCTOS_QUERY } from '@/types/producto';

const PAGE_LIMIT = 200; // máximo que acepta /api/productos (verificado: limit>200 responde 422)
const CACHE_KEY = 'productos_catalogo_cache_v1';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas

interface CacheShape {
  productos: ProductoResumen[];
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

function writeCache(productos: ProductoResumen[]): string {
  const lastUpdated = new Date().toISOString();
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ productos, lastUpdated }));
  } catch {
    // Catálogo grande (23,000+ filas): si excede la cuota de localStorage, sigue
    // funcionando solo en memoria de esta pestaña (se vuelve a cargar al recargar la página).
  }
  return lastUpdated;
}

function toResumen(p: Record<string, unknown>): ProductoResumen {
  return {
    codigo: String(p.codigo ?? ''),
    nombre: (p.nombre as string) ?? null,
    familia_nombre: (p.familia_nombre as string) ?? null,
    linea_nombre: (p.linea_nombre as string) ?? null,
    status: (p.status as string) ?? null,
    criticidad: (p.criticidad as string) ?? null,
    segmento_abc: (p.segmento_abc as string) ?? null,
    proveedor: (p.proveedor as string) ?? null,
    stock_actual: (p.stock_actual as number) ?? null,
    cobertura_actual: (p.cobertura_actual as number) ?? null,
    compra_sugerida: (p.compra_sugerida as number) ?? null,
    valor_compra_usd: (p.valor_compra_usd as number) ?? null,
    total_valorizado: (p.total_valorizado as number) ?? null,
    tendencia: (p.tendencia as string) ?? null,
    precio_confiabilidad: (p.precio_confiabilidad as string) ?? null,
  };
}

interface State {
  productos: ProductoResumen[];
  loading: boolean;
  progress: CargaProgresoProductos | null;
  error: string | null;
  lastUpdated: string | null;
}

/**
 * Trae el catálogo COMPLETO de productos (23,000+, sin paginar) para la vista
 * "Ver catálogo completo" de la sección Productos. Es una carga pesada
 * (~117 páginas de 200 a ~2.5s cada una ≈ 5 minutos, medido directamente
 * contra la API) — se hace una sola vez, se cachea (memoria + localStorage
 * 24h, solo con los campos que la tabla muestra) y todo el filtrado/orden/
 * paginación posterior ocurre en el cliente sin volver a consultar la API.
 *
 * No reemplaza a `useProductos` (vista rápida paginada del servidor, que
 * sigue alimentando Dashboard/Análisis) — es un modo alternativo, opcional,
 * solo para quien quiera ver/recorrer el catálogo completo de una vez.
 */
export function useProductosCatalogo() {
  const [state, setState] = useState<State>({ productos: [], loading: false, progress: null, error: null, lastUpdated: null });
  const [iniciado, setIniciado] = useState(false);
  const cancelRef = useRef(false);
  const startedRef = useRef(false);

  const load = useCallback(async (forceRefresh: boolean) => {
    cancelRef.current = false;

    if (!forceRefresh) {
      const cached = readCache();
      if (cached) {
        setState({ productos: cached.productos, loading: false, progress: null, error: null, lastUpdated: cached.lastUpdated });
        return;
      }
    }

    setState((prev) => ({ ...prev, loading: true, error: null, progress: { paginaActual: 0, totalPaginas: 1, productosTotales: 0 } }));

    try {
      const first = await fetchProductos({ ...DEFAULT_PRODUCTOS_QUERY, page: 1, limit: PAGE_LIMIT });
      if (cancelRef.current) return;

      let acumulado: ProductoResumen[] = first.data.map(toResumen);
      setState((prev) => ({ ...prev, progress: { paginaActual: 1, totalPaginas: first.pages, productosTotales: first.total } }));

      for (let page = 2; page <= first.pages; page += 1) {
        if (cancelRef.current) return;
        // eslint-disable-next-line no-await-in-loop
        const response = await fetchProductos({ ...DEFAULT_PRODUCTOS_QUERY, page, limit: PAGE_LIMIT });
        if (cancelRef.current) return;
        acumulado = acumulado.concat(response.data.map(toResumen));
        setState((prev) => ({
          ...prev,
          productos: acumulado,
          progress: { paginaActual: page, totalPaginas: first.pages, productosTotales: first.total },
        }));
      }

      const lastUpdated = writeCache(acumulado);
      setState({ productos: acumulado, loading: false, progress: null, error: null, lastUpdated });
    } catch {
      if (!cancelRef.current) {
        setState((prev) => ({ ...prev, loading: false, error: 'No fue posible cargar el catálogo completo. Intenta actualizar nuevamente.' }));
      }
    }
  }, []);

  // A diferencia de "Rotación", este catálogo NO se carga automáticamente al entrar a la
  // página (es una carga de ~5 minutos) — se dispara explícitamente con `iniciar()`.
  // Excepción: si ya hay una caché vigente (<24h) de una carga anterior, se muestra directo.
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      startedRef.current = true;
      setIniciado(true);
      setState({ productos: cached.productos, loading: false, progress: null, error: null, lastUpdated: cached.lastUpdated });
    }
    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iniciar = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setIniciado(true);
    load(false);
  }, [load]);

  const refresh = useCallback(() => {
    startedRef.current = true;
    setIniciado(true);
    load(true);
  }, [load]);

  return { ...state, iniciado, iniciar, refresh };
}

export type UseProductosCatalogoReturn = ReturnType<typeof useProductosCatalogo>;
