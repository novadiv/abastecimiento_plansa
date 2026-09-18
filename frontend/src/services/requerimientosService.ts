import { apiClient } from './apiClient';
import type {
  ConsolidadoProductoResponse,
  MisComprasFilters,
  RequerimientosFiltrosOptions,
  RequerimientosKpis,
  RequerimientosListaResponse,
  StatsOC,
} from '@/types/requerimiento';

/**
 * Acceso a los endpoints de Requerimientos (`/api/requerimientos/*`) que
 * alimentan el módulo "Mis Compras". Todas las funciones aceptan
 * `responsable` explícitamente — nunca asumen "el usuario actual".
 */

function baseParams(responsable: string, filters: MisComprasFilters) {
  return {
    responsable,
    año: filters.año,
    mes: filters.mes,
    familia: filters.familia,
    area_origen: filters.area_origen,
    proveedor: filters.proveedor,
    estado_normalizado: filters.estado_normalizado,
    search: filters.search,
  };
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

// consolidado-producto es una agregación pesada del lado del servidor con
// latencia MUY variable (medido directamente: entre 2.5s y ~40s por página de
// 200 materiales según la carga del servidor en ese momento). El timeout por
// defecto del cliente (20s) es demasiado justo para los picos — se le da
// margen amplio, y además cada página se reintenta hasta 3 veces (ver
// `useConsolidadoResponsable.ts`) por si aun así se excede puntualmente.
const CONSOLIDADO_TIMEOUT_MS = 60_000;

export function fetchRequerimientosKpis(responsable: string, filters: MisComprasFilters): Promise<RequerimientosKpis> {
  return apiClient
    .get<ApiEnvelope<RequerimientosKpis>>('/requerimientos/kpis', baseParams(responsable, filters))
    .then((r) => r.data);
}

export function fetchStatsOC(responsable: string, filters: MisComprasFilters): Promise<StatsOC> {
  return apiClient.get<ApiEnvelope<StatsOC>>('/requerimientos/stats-oc', baseParams(responsable, filters)).then((r) => r.data);
}

export function fetchConsolidadoProducto(
  responsable: string,
  filters: MisComprasFilters,
  page: number,
  limit: number,
): Promise<ConsolidadoProductoResponse> {
  return apiClient.get<ConsolidadoProductoResponse>(
    '/requerimientos/consolidado-producto',
    { ...baseParams(responsable, filters), page, limit, dias_rango: 99999 },
    { timeoutMs: CONSOLIDADO_TIMEOUT_MS },
  );
}

export function fetchRequerimientosLista(
  responsable: string,
  filters: MisComprasFilters,
  page: number,
  limit: number,
): Promise<RequerimientosListaResponse> {
  return apiClient.get<RequerimientosListaResponse>('/requerimientos/lista', {
    ...baseParams(responsable, filters),
    page,
    limit,
  });
}

/**
 * Catálogo GLOBAL de materiales consolidados (sin filtrar por responsable) —
 * usado por "Análisis de Rotación". Soporta orden del lado del servidor
 * (`sort_by`/`sort_order`); el máximo de `limit` que acepta el servidor es 200.
 */
export function fetchConsolidadoGlobalPage(
  page: number,
  limit: number,
  sortBy = 'n_reqs',
  sortOrder: 1 | -1 = -1,
): Promise<ConsolidadoProductoResponse> {
  return apiClient.get<ConsolidadoProductoResponse>(
    '/requerimientos/consolidado-producto',
    { page, limit, dias_rango: 99999, sort_by: sortBy, sort_order: sortOrder },
    { timeoutMs: CONSOLIDADO_TIMEOUT_MS },
  );
}

/** Detalle completo (con historial) de un único material, para el drill-down. */
export async function fetchConsolidadoDetalle(codigo: string): Promise<ConsolidadoProductoResponse['data'][number] | null> {
  const response = await apiClient.get<ConsolidadoProductoResponse>(
    '/requerimientos/consolidado-producto',
    { page: 1, limit: 1, dias_rango: 99999, search: codigo },
    { timeoutMs: CONSOLIDADO_TIMEOUT_MS },
  );
  return response.data[0] ?? null;
}

export async function fetchRequerimientosFiltros(): Promise<RequerimientosFiltrosOptions> {
  const response = await apiClient.get<{
    success: boolean;
    años: number[];
    familias: string[];
    areas: string[];
    responsables: string[];
    estados_normalizados: string[];
  }>('/requerimientos/filtros');

  // El endpoint real devuelve objetos {proveedor, n_ocs} (no strings, a pesar de lo que
  // sugeriría el nombre "proveedores") — se extrae solo el nombre para los selects de filtro.
  const catalogo = await apiClient.get<{ success: boolean; proveedores: { proveedor: string; n_ocs: number }[] }>(
    '/requerimientos/consolidado-filtros',
  );

  return {
    años: response.años ?? [],
    familias: response.familias ?? [],
    areas: response.areas ?? [],
    responsables: response.responsables ?? [],
    estados_normalizados: response.estados_normalizados ?? [],
    proveedores: (catalogo.proveedores ?? []).map((p) => p.proveedor),
  };
}
