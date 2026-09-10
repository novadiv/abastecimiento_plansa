import { apiClient } from './apiClient';
import type { CatalogoOpcion, DashboardKpis, ProductosQuery, ProductosResponse } from '@/types/producto';

/**
 * Acceso a los endpoints del módulo "Productos" (`/api/productos/*`) y al
 * resumen global del dashboard (`/api/dashboard/kpis`).
 */

export function fetchProductos(query: ProductosQuery): Promise<ProductosResponse> {
  return apiClient.get<ProductosResponse>('/productos', {
    page: query.page,
    limit: query.limit,
    sort_by: query.sort_by,
    sort_order: query.sort_order,
    search: query.search,
    familia: query.familia,
    linea: query.linea,
    status: query.status,
    criticidad: query.criticidad,
    segmento_abc: query.segmento_abc,
    tendencia: query.tendencia,
  });
}

interface CatalogoResponse {
  success: boolean;
  data: CatalogoOpcion[];
}

export async function fetchFamilias(): Promise<CatalogoOpcion[]> {
  const response = await apiClient.get<CatalogoResponse>('/productos/familias');
  return response.data;
}

export async function fetchLineas(familia?: string): Promise<CatalogoOpcion[]> {
  const response = await apiClient.get<CatalogoResponse>('/productos/lineas', { familia });
  return response.data;
}

interface DashboardKpisResponse {
  success: boolean;
  data: DashboardKpis;
}

export async function fetchDashboardKpis(): Promise<DashboardKpis> {
  const response = await apiClient.get<DashboardKpisResponse>('/dashboard/kpis');
  return response.data;
}
