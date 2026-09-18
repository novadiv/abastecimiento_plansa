/**
 * Acceso al backend de Abastecimiento (FastAPI sobre el ERP NetComercial).
 *
 * Es un servicio distinto del resto de la app: `apiClient` habla con la API
 * de MongoDB que sirve login, productos y requerimientos; este habla con el
 * backend que lee los DBF de FoxPro. Por eso tiene su propia URL base
 * (`VITE_ABASTECIMIENTO_API_URL`) y no reutiliza aquel cliente.
 */

import type {
  BaseConsumo,
  CatalogosAbastecimiento,
  DetalleProducto,
  FiltrosAbastecimiento,
  HistorialProducto,
  MaestroCompradores,
  PlanOrdenes,
  ProveedoresProducto,
  RespuestaConsolidado,
  SustentoProducto,
  TipoProducto,
} from '@/types/abastecimiento';

export const ABASTECIMIENTO_API_URL: string =
  (import.meta.env.VITE_ABASTECIMIENTO_API_URL as string | undefined) ??
  'http://127.0.0.1:8100/api';

export class ErrorAbastecimiento extends Error {
  status: number;

  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.status = status;
  }
}

/**
 * El consolidado de un año entero agrega ~80.000 líneas del lado de FoxPro y
 * la primera llamada tarda unos 40 s (después el backend la sirve de caché).
 * Un timeout corto cortaría la consulta justo cuando está funcionando.
 */
const TIMEOUT_CONSULTA_PESADA_MS = 180_000;
const TIMEOUT_NORMAL_MS = 30_000;

function construirQuery(params: Record<string, string | number | boolean | undefined>): string {
  const pares = Object.entries(params)
    .filter(([, valor]) => valor !== undefined && valor !== '' && valor !== null)
    .map(([clave, valor]) => `${encodeURIComponent(clave)}=${encodeURIComponent(String(valor))}`);
  return pares.length > 0 ? `?${pares.join('&')}` : '';
}

async function pedir<T>(
  ruta: string,
  params: Record<string, string | number | boolean | undefined> = {},
  timeoutMs = TIMEOUT_NORMAL_MS,
): Promise<T> {
  const controlador = new AbortController();
  const temporizador = window.setTimeout(() => controlador.abort(), timeoutMs);

  let respuesta: Response;
  try {
    respuesta = await fetch(`${ABASTECIMIENTO_API_URL}${ruta}${construirQuery(params)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controlador.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ErrorAbastecimiento(
        'La consulta tardó demasiado. El ERP responde con lentitud cuando el rango de fechas es muy amplio: prueba a acotarlo.',
        0,
      );
    }
    throw new ErrorAbastecimiento(
      `El servicio de datos no está encendido. Abre la carpeta del proyecto y haz doble clic en INICIAR_BACKEND.bat; deja esa ventana abierta y vuelve a intentarlo. (Servicio esperado en ${ABASTECIMIENTO_API_URL})`,
      0,
    );
  } finally {
    window.clearTimeout(temporizador);
  }

  let cuerpo: unknown = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // Respuesta sin JSON; se resuelve abajo según el estado.
  }

  if (!respuesta.ok) {
    const detalle =
      cuerpo && typeof cuerpo === 'object' && cuerpo !== null && 'detail' in cuerpo
        ? String((cuerpo as { detail?: unknown }).detail)
        : `Error HTTP ${respuesta.status}`;
    throw new ErrorAbastecimiento(detalle, respuesta.status);
  }

  return cuerpo as T;
}

export function fetchCatalogos(): Promise<CatalogosAbastecimiento> {
  return pedir<CatalogosAbastecimiento>('/catalogos');
}

export function fetchConsolidado(filtros: FiltrosAbastecimiento): Promise<RespuestaConsolidado> {
  return pedir<RespuestaConsolidado>(
    '/consolidado',
    {
      desde: filtros.desde,
      hasta: filtros.hasta,
      area: filtros.area || undefined,
      usuario: filtros.usuario || undefined,
      almacen: filtros.almacen || undefined,
      base: filtros.base,
      meses: filtros.meses,
      solo_por_comprar: filtros.soloPorComprar,
      incluir_pendiente: filtros.incluirPendiente,
      comprador: filtros.comprador || undefined,
    },
    TIMEOUT_CONSULTA_PESADA_MS,
  );
}

export function fetchDetalleProducto(
  codigo: string,
  filtros: Pick<FiltrosAbastecimiento, 'desde' | 'hasta' | 'area' | 'usuario' | 'almacen'>,
): Promise<DetalleProducto> {
  return pedir<DetalleProducto>(
    `/consolidado/${encodeURIComponent(codigo)}/detalle`,
    {
      desde: filtros.desde,
      hasta: filtros.hasta,
      area: filtros.area || undefined,
      usuario: filtros.usuario || undefined,
      almacen: filtros.almacen || undefined,
    },
    TIMEOUT_CONSULTA_PESADA_MS,
  );
}

export function fetchHistorialProducto(
  codigo: string,
  desde: string,
  hasta: string,
): Promise<HistorialProducto> {
  return pedir<HistorialProducto>(
    `/producto/${encodeURIComponent(codigo)}/historial`,
    { desde, hasta },
    TIMEOUT_CONSULTA_PESADA_MS,
  );
}

/** La demostración aritmética del ritmo: de dónde sale el número. */
export function fetchSustento(
  codigo: string,
  desde: string,
  hasta: string,
  base: BaseConsumo,
  meses: number,
): Promise<SustentoProducto> {
  return pedir<SustentoProducto>(
    `/producto/${encodeURIComponent(codigo)}/sustento`,
    { desde, hasta, base, meses },
    TIMEOUT_CONSULTA_PESADA_MS,
  );
}

/** A qué proveedor comprarle, ordenado por precio (convertido a soles). */
export function fetchProveedores(
  codigo: string,
  desde: string,
  hasta: string,
  cantidad?: number,
): Promise<ProveedoresProducto> {
  return pedir<ProveedoresProducto>(
    `/producto/${encodeURIComponent(codigo)}/proveedores`,
    { desde, hasta, cantidad },
    TIMEOUT_CONSULTA_PESADA_MS,
  );
}

export function fetchMaestroCompradores(): Promise<MaestroCompradores> {
  return pedir<MaestroCompradores>('/compradores');
}

export interface OpcionesPlan {
  desde: string;
  hasta: string;
  base: BaseConsumo;
  meses: number;
  comprador?: string;
  excluirTipos: string[];
  costoOrden: number;
  tasaAlmacen: number;
}

/** El plan de órdenes: qué girar, a qué proveedor y cada cuánto. */
export function fetchPlanOrdenes(opciones: OpcionesPlan): Promise<PlanOrdenes> {
  return pedir<PlanOrdenes>(
    '/plan-ordenes',
    {
      desde: opciones.desde,
      hasta: opciones.hasta,
      base: opciones.base,
      meses: opciones.meses,
      comprador: opciones.comprador || undefined,
      excluir_tipos: opciones.excluirTipos.join(',') || undefined,
      costo_orden: opciones.costoOrden,
      tasa_almacen: opciones.tasaAlmacen,
    },
    TIMEOUT_CONSULTA_PESADA_MS,
  );
}

export function fetchTiposProducto(): Promise<{ tipos: TipoProducto[] }> {
  return pedir<{ tipos: TipoProducto[] }>('/tipos-producto');
}

export function fetchSalud(): Promise<Record<string, unknown>> {
  return pedir<Record<string, unknown>>('/salud');
}
