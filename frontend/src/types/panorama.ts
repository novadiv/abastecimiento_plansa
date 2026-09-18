/**
 * "Panorama Completo de Materiales" — clasificación de TODO el universo de
 * compra de un responsable (jcamacho / JEANPIERO PEREA) en 4 categorías
 * MUTUAMENTE EXCLUYENTES, a diferencia de "Materiales y Rotación" (donde
 * "sin rotación" y "estacional" son etiquetas independientes que pueden
 * coexistir). Aquí, si hay evidencia de estacionalidad, esa es la
 * clasificación — prevalece sobre el conteo de movimientos.
 */

export type PanoramaNivel = 'alta' | 'media' | 'estacional' | 'baja';

export type PanoramaRecomendacion = 'COMPRAR AHORA' | 'PROGRAMAR' | 'REVISAR TEMPORADA' | 'NO ABASTECER';

export interface MaterialPanorama {
  codigo: string;
  producto: string;
  familia: string | null;
  unidadMedida: string | null;

  vecesSolicitado: number;
  cantidadTotal: number;
  cantidadPorComprar: number;
  reqPendientes: number;
  reqNumeros: string[];

  primeraSolicitud: string | null;
  ultimaSolicitud: string | null;
  frecuenciaPromedioDias: number | null;
  diasSinMovimiento: number | null;

  /** cantidadTotal repartida entre los meses reales de actividad (primera→última solicitud). */
  consumoMensualEstimado: number | null;

  proveedorPrincipal: string | null;
  ultimaOC: string | null;
  precioReferencia: number | null;
  monedaReferencia: string | null;
  valorEstimado: number | null;

  nivel: PanoramaNivel;

  // Solo tiene sentido cuando nivel === 'estacional'; en el resto de niveles queda en null.
  consumoPorMes: number[];
  mesMayorConsumo: string | null;
  variacionConsumoPct: number | null;

  /** Meses de cobertura objetivo según el nivel (2 alta / 3 media / 0 baja / null estacional — depende de temporada, no de un número fijo). */
  coberturaObjetivoMeses: number | null;
  /** consumoMensualEstimado × coberturaObjetivoMeses. null cuando no aplica (baja rotación, o estacional sin dato de temporada activa). */
  cantidadRecomendada: number | null;
  recomendacion: PanoramaRecomendacion;
}

export interface PanoramaFilters {
  /** Checkboxes acumulativos (unión, no intersección) — vacío/undefined = todas. */
  categorias?: PanoramaNivel[];
  search?: string;
  familia?: string;
  /** Atajo del botón "Materiales para comprar": alta o media con recomendación distinta de NO ABASTECER. */
  soloParaComprar?: boolean;
}

export interface PanoramaProgreso {
  paginaActual: number;
  totalPaginas: number;
  materialesTotales: number;
}
