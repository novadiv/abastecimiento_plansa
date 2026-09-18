/**
 * Acceso a la cola del bot RPA.
 *
 * Va contra el mismo backend de FastAPI que el resto de Abastecimiento
 * (`VITE_ABASTECIMIENTO_API_URL`), pero por rutas propias bajo `/bot`. Se
 * reutiliza esa URL base a propósito: es el mismo servicio, y tener dos
 * configuraciones que apuntan al mismo sitio solo sirve para que un día
 * queden desincronizadas.
 *
 * Nada de aquí toca el ERP. La cola vive en un SQLite aparte.
 */

import { ABASTECIMIENTO_API_URL, ErrorAbastecimiento } from './abastecimientoService';
import type {
  AccionControl,
  EjecucionBot,
  EstadoBot,
  EventoBot,
  HorarioBot,
  LoteBot,
  NuevoHorario,
  RespuestaEncolar,
  UnidadAEncolar,
  UnidadBot,
} from '@/types/bot';

/** La cola responde al instante: no hay consultas pesadas al ERP aquí. */
const TIMEOUT_MS = 20_000;

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const controlador = new AbortController();
  const temporizador = window.setTimeout(() => controlador.abort(), TIMEOUT_MS);

  let respuesta: Response;
  try {
    respuesta = await fetch(`${ABASTECIMIENTO_API_URL}/bot${ruta}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controlador.signal,
      ...opciones,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ErrorAbastecimiento('El servicio del bot tardó demasiado en responder.', 0);
    }
    throw new ErrorAbastecimiento(
      'El servicio de datos no está encendido. Abre la carpeta del proyecto y haz doble clic en INICIAR_BACKEND.bat; deja esa ventana abierta y vuelve a intentarlo.',
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

function enviar<T>(ruta: string, cuerpo?: unknown): Promise<T> {
  return pedir<T>(ruta, {
    method: 'POST',
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

// ── Estado general ────────────────────────────────────────────────

export function fetchEstadoBot(): Promise<EstadoBot> {
  return pedir<EstadoBot>('/estado');
}

// ── Encolar trabajo ───────────────────────────────────────────────

export interface OpcionesEncolar {
  unidades: UnidadAEncolar[];
  solicitadoPor: string;
  nota?: string;
  origen?: string;
  parametros?: Record<string, unknown>;
  tarea?: string;
}

/**
 * Manda unidades a la cola.
 *
 * El backend rechaza las que ya están esperando: sin esa guarda, un doble
 * clic en el botón dejaría el mismo trabajo dos veces, y lo que el bot
 * escribe en el ERP no se deshace desde aquí. Las rechazadas vuelven en
 * `rechazadas` para poder decirlo en pantalla, no en silencio.
 */
export function encolarUnidades(opciones: OpcionesEncolar): Promise<RespuestaEncolar> {
  return enviar<RespuestaEncolar>('/encolar', {
    tarea: opciones.tarea ?? 'oc_netcomercial',
    unidades: opciones.unidades,
    solicitado_por: opciones.solicitadoPor,
    nota: opciones.nota ?? '',
    origen: opciones.origen ?? 'plan-ordenes',
    parametros: opciones.parametros ?? {},
  });
}

// ── Lotes ─────────────────────────────────────────────────────────

export function fetchLotes(limite = 50): Promise<{ lotes: LoteBot[] }> {
  return pedir<{ lotes: LoteBot[] }>(`/lotes?limite=${limite}`);
}

export function fetchItemsLote(loteId: number): Promise<{ items: UnidadBot[] }> {
  return pedir<{ items: UnidadBot[] }>(`/lote/${loteId}/items`);
}

export function cancelarLote(loteId: number): Promise<{ cancelados: number }> {
  return enviar<{ cancelados: number }>(`/lote/${loteId}/cancelar`);
}

export function reintentarUnidad(itemId: number): Promise<{ item_id: number }> {
  return enviar<{ item_id: number }>(`/item/${itemId}/reintentar`);
}

// ── Ejecuciones y bitácora ────────────────────────────────────────

export function fetchEjecuciones(limite = 30): Promise<{ ejecuciones: EjecucionBot[] }> {
  return pedir<{ ejecuciones: EjecucionBot[] }>(`/ejecuciones?limite=${limite}`);
}

export function fetchEventos(
  ejecucionId: number,
  soloErrores = false,
): Promise<{ eventos: EventoBot[] }> {
  return pedir<{ eventos: EventoBot[] }>(
    `/ejecucion/${ejecucionId}/eventos?solo_errores=${soloErrores}`,
  );
}

export function controlarEjecucion(
  ejecucionId: number,
  accion: AccionControl,
  itemId?: number,
): Promise<{ control_id: number; nota: string }> {
  return enviar(`/ejecucion/${ejecucionId}/control`, { accion, item_id: itemId ?? null });
}

/** La URL de la captura de pantalla de un error, para mostrarla en la bitácora. */
export function urlCaptura(nombre: string): string {
  return `${ABASTECIMIENTO_API_URL}/bot/captura/${encodeURIComponent(nombre)}`;
}

// ── Horarios ──────────────────────────────────────────────────────

export function fetchHorarios(): Promise<{ horarios: HorarioBot[] }> {
  return pedir<{ horarios: HorarioBot[] }>('/horarios');
}

export function crearHorario(
  horario: NuevoHorario,
  tarea = 'oc_netcomercial',
): Promise<{ horario_id: number }> {
  return enviar('/horarios', { tarea, ...horario });
}

export function actualizarHorario(
  horarioId: number,
  cambios: Partial<NuevoHorario>,
): Promise<{ horario_id: number }> {
  return enviar(`/horarios/${horarioId}/actualizar`, cambios);
}

export function eliminarHorario(horarioId: number): Promise<{ eliminado: boolean }> {
  return enviar(`/horarios/${horarioId}/eliminar`);
}
