import type { ProductoResumen } from '@/types/producto';

/** Filtrado/orden 100% en cliente sobre el catálogo completo ya cargado — sin volver a golpear el servidor. */
export interface ProductosCatalogoFilters {
  search?: string;
  familia?: string;
  linea?: string;
  status?: string;
  criticidad?: string;
  segmento_abc?: string;
  tendencia?: string;
}

export type ProductosCatalogoSortKey =
  | 'codigo'
  | 'stock_actual'
  | 'cobertura_actual'
  | 'compra_sugerida'
  | 'valor_compra_usd'
  | 'total_valorizado';

export function applyProductosCatalogoFilters(productos: ProductoResumen[], filters: ProductosCatalogoFilters): ProductoResumen[] {
  const term = filters.search?.trim().toLowerCase();
  return productos.filter((p) => {
    if (filters.familia && p.familia_nombre !== filters.familia) return false;
    if (filters.linea && p.linea_nombre !== filters.linea) return false;
    if (filters.status && p.status !== filters.status) return false;
    if (filters.criticidad && p.criticidad !== filters.criticidad) return false;
    if (filters.segmento_abc && p.segmento_abc !== filters.segmento_abc) return false;
    if (filters.tendencia && p.tendencia !== filters.tendencia) return false;
    if (term) {
      const haystack = `${p.codigo} ${p.nombre ?? ''}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function sortProductosCatalogo(productos: ProductoResumen[], key: ProductosCatalogoSortKey, direction: 1 | -1): ProductoResumen[] {
  return [...productos].sort((a, b) => {
    if (key === 'codigo') return a.codigo.localeCompare(b.codigo) * direction;
    const va = (a[key] as number | null) ?? -Infinity;
    const vb = (b[key] as number | null) ?? -Infinity;
    return (va - vb) * direction;
  });
}

/** Opciones únicas de cada campo, calculadas sobre el catálogo ya cargado — para poblar los selects de filtro sin pedirlas al servidor. */
export function buildFiltroOpciones(productos: ProductoResumen[]) {
  const uniques = (values: (string | null)[]) => Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort();
  return {
    familias: uniques(productos.map((p) => p.familia_nombre)),
    lineas: uniques(productos.map((p) => p.linea_nombre)),
    status: uniques(productos.map((p) => p.status)),
    criticidades: uniques(productos.map((p) => p.criticidad)),
    segmentos: uniques(productos.map((p) => p.segmento_abc)),
    tendencias: uniques(productos.map((p) => p.tendencia)),
  };
}
