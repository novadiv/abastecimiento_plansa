import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchConsolidadoProducto } from '@/services/requerimientosService';
import type { ConsolidadoProductoRecord } from '@/types/requerimiento';
import { fetchConReintento } from '@/utils/fetchConReintento';

const PAGE_LIMIT = 200; // máximo que acepta consolidado-producto
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas
// Reintentos más agresivos que el default (5 en vez de 3) porque este endpoint
// concreto es el más pesado e inestable de toda la API (medido: 2.5s-40s+ por página).
const MAX_INTENTOS = 5;

function fetchPaginaConReintento(responsable: string, page: number) {
  return fetchConReintento(() => fetchConsolidadoProducto(responsable, {}, page, PAGE_LIMIT), MAX_INTENTOS);
}

interface CacheShape {
  registros: ConsolidadoProductoRecord[];
  lastUpdated: string;
}

interface Progreso {
  paginaActual: number;
  totalPaginas: number;
  materialesTotales: number;
}

function cacheKey(responsable: string): string {
  return `consolidado_crudo_cache_v1_${responsable}`;
}

function readCache(responsable: string): CacheShape | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(responsable));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    const age = Date.now() - new Date(parsed.lastUpdated).getTime();
    if (age > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(responsable: string, registros: ConsolidadoProductoRecord[]): string {
  const lastUpdated = new Date().toISOString();
  try {
    window.localStorage.setItem(cacheKey(responsable), JSON.stringify({ registros, lastUpdated }));
  } catch {
    // localStorage no disponible/cuota excedida — sigue funcionando en memoria de esta pestaña.
  }
  return lastUpdated;
}

interface State {
  registros: ConsolidadoProductoRecord[];
  loading: boolean;
  progress: Progreso | null;
  error: string | null;
  lastUpdated: string | null;
}

/**
 * Carga TODO el historial consolidado (sin filtrar por año — ese parámetro
 * no funciona en este endpoint, ver `utils/filtroAnio.ts`) del responsable
 * de sesión — fuente cruda compartida por "Panorama de Materiales" y "Plan
 * de Compras (2 meses)", para no traer las mismas páginas dos veces. Cada
 * módulo deriva su propia vista (clasificación, filtro de año, conciliación
 * OC↔requerimiento) con funciones puras sobre este mismo array — así cambiar
 * de año es instantáneo, sin volver a pedirle nada al servidor.
 *
 * Si una página falla incluso después de reintentar, NO se descarta todo lo
 * ya cargado: se muestran las páginas que sí llegaron, con un aviso de que
 * el resultado es parcial — es más útil que una pantalla de error vacía.
 */
export function useConsolidadoResponsable(responsable: string | null) {
  const [state, setState] = useState<State>({ registros: [], loading: false, progress: null, error: null, lastUpdated: null });
  const cancelRef = useRef(false);

  const load = useCallback(async (resp: string, forceRefresh: boolean) => {
    cancelRef.current = false;

    if (!forceRefresh) {
      const cached = readCache(resp);
      if (cached) {
        setState({ registros: cached.registros, loading: false, progress: null, error: null, lastUpdated: cached.lastUpdated });
        return;
      }
    }

    setState((prev) => ({ ...prev, loading: true, error: null, progress: { paginaActual: 0, totalPaginas: 1, materialesTotales: 0 } }));

    let acumulado: ConsolidadoProductoRecord[] = [];
    let totalPaginas = 1;
    let materialesTotales = 0;

    try {
      const first = await fetchPaginaConReintento(resp, 1);
      if (cancelRef.current) return;

      acumulado = first.data;
      totalPaginas = first.pages;
      materialesTotales = first.total;
      setState((prev) => ({ ...prev, progress: { paginaActual: 1, totalPaginas, materialesTotales } }));

      for (let page = 2; page <= totalPaginas; page += 1) {
        if (cancelRef.current) return;
        // eslint-disable-next-line no-await-in-loop
        const response = await fetchPaginaConReintento(resp, page);
        if (cancelRef.current) return;
        acumulado = acumulado.concat(response.data);
        setState((prev) => ({ ...prev, progress: { paginaActual: page, totalPaginas, materialesTotales } }));
      }

      const lastUpdated = writeCache(resp, acumulado);
      setState({ registros: acumulado, loading: false, progress: null, error: null, lastUpdated });
    } catch (err) {
      if (cancelRef.current) return;
      // Se expone el motivo real (no solo un mensaje genérico) para poder diagnosticar
      // sin adivinar — puede ser un timeout, un error del servidor, o de red.
      const detalle = err instanceof Error ? err.message : String(err);
      if (acumulado.length > 0) {
        // Se logró traer parte del catálogo antes de que fallara — se muestra eso,
        // marcado como parcial, en vez de descartarlo.
        const lastUpdated = writeCache(resp, acumulado);
        setState({
          registros: acumulado,
          loading: false,
          progress: null,
          error: `Solo se pudo cargar una parte de tu historial (${detalle}). Datos parciales de ${acumulado.length} de ${materialesTotales || '?'} materiales — dale "Actualizar" para reintentar completarlo.`,
          lastUpdated,
        });
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: `No fue posible cargar tu historial completo. Motivo: ${detalle}`,
        }));
      }
    }
  }, []);

  useEffect(() => {
    if (!responsable) {
      setState({ registros: [], loading: false, progress: null, error: null, lastUpdated: null });
      return;
    }
    load(responsable, false);
    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responsable]);

  const refresh = useCallback(() => {
    if (responsable) load(responsable, true);
  }, [responsable, load]);

  return { ...state, refresh };
}

export type UseConsolidadoResponsableReturn = ReturnType<typeof useConsolidadoResponsable>;
