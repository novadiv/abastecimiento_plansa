/**
 * Tipos del bot RPA.
 *
 * Reflejan lo que devuelve `/api/bot/...` del backend de FastAPI. Los
 * nombres son deliberadamente neutros —`clave`, `etiqueta`, `valor`,
 * `resultado`— porque la cola no sabe nada de órdenes de compra: es la
 * misma maquinaria para cualquier proceso que se automatice después.
 */

/** Estado de una unidad de trabajo dentro de la cola. */
export type EstadoUnidad =
  | 'pendiente'
  | 'en_proceso'
  | 'completado'
  | 'fallido'
  | 'saltado'
  | 'cancelado';

/** Estado de una corrida del bot. */
export type EstadoEjecucion =
  | 'en_cola'
  | 'corriendo'
  | 'pausada'
  | 'completada'
  | 'fallida'
  | 'abortada';

export type EstadoLote = 'pendiente' | 'en_proceso' | 'completado' | 'fallido' | 'cancelado';

export type NivelEvento = 'info' | 'aviso' | 'error';

export type AccionControl = 'pausar' | 'reanudar' | 'saltar' | 'detener' | 'posponer';

/** Una unidad de trabajo: lo que el bot procesa de principio a fin. */
export interface UnidadBot {
  id: number;
  lote_id: number;
  /** Identificador propio del proceso. Es lo que impide duplicados. */
  clave: string;
  /** El nombre legible, el que ve una persona. */
  etiqueta: string;
  n_detalles: number;
  /** Magnitud opcional para ordenar la cola. Las mayores se procesan antes. */
  valor: number;
  estado: EstadoUnidad;
  intentos: number;
  /** Lo que el proceso devolvió: un número de documento, una ruta, un dato. */
  resultado: string;
  error: string;
  ejecucion_id: number | null;
  creado: string;
  actualizado: string;
}

/** Un envío: lo que alguien mandó al bot de una sola vez. */
export interface LoteBot {
  id: number;
  tarea_id: number;
  tarea_nombre: string;
  origen: string;
  solicitado_por: string;
  nota: string;
  parametros: string;
  estado: EstadoLote;
  creado: string;
  actualizado: string;
  items: number;
  pendientes: number;
  completados: number;
  fallidos: number;
  valor: number;
}

/** Una corrida del bot. */
export interface EjecucionBot {
  id: number;
  job_id: string;
  tarea_id: number;
  tarea_nombre: string;
  horario_id: number | null;
  disparo: 'horario' | 'manual';
  estado: EstadoEjecucion;
  paso_actual: string;
  progreso: number;
  total: number;
  exitosos: number;
  fallidos: number;
  saltados: number;
  inicio: string | null;
  fin: string | null;
  error: string;
  pid: number | null;
  latido: string | null;
  creado: string;
  errores?: number;
}

/** Una línea de la bitácora. */
export interface EventoBot {
  id: number;
  ejecucion_id: number;
  item_id: number | null;
  momento: string;
  nivel: NivelEvento;
  paso: string;
  mensaje: string;
  /** Nombre del PNG de la captura, si el paso falló. */
  captura: string;
  detalle: string;
  etiqueta: string | null;
}

/** Cuándo se dispara una tarea. */
export interface HorarioBot {
  id: number;
  tarea_id: number;
  tarea_clave: string;
  tarea_nombre: string;
  tarea_activa: number;
  nombre: string;
  /** 'HH:MM', hora local. */
  hora: string;
  /** Días de la semana separados por comas: 1 = lunes ... 7 = domingo. */
  dias: string;
  activo: number;
  aviso_segundos: number;
  /** Tope de unidades por corrida. null = sin tope. */
  max_items: number | null;
  creado: string;
  actualizado: string;
}

export interface TareaBot {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string;
  estrategia: string;
  activa: number;
  creada: string;
}

/** Lo que alimenta la pantalla de Administración. */
export interface EstadoBot {
  archivo: string;
  ejecucion_viva: EjecucionBot | null;
  ultima_ejecucion: EjecucionBot | null;
  pendientes: number;
  valor_pendiente: number;
  fallidos: number;
  horarios_activos: number;
  tareas: TareaBot[];
  horarios: HorarioBot[];
  /** false = falta definir BOT_TOKEN en el .env; el worker no puede reportar. */
  configurado: boolean;
}

/** Una unidad tal como se manda a encolar. */
export interface UnidadAEncolar {
  clave: string;
  etiqueta: string;
  valor: number;
  n_detalles: number;
  /** El contenido congelado: lo que la persona vio y aprobó al pulsar el botón. */
  payload: Record<string, unknown>;
}

export interface RespuestaEncolar {
  lote_id: number;
  aceptadas: number;
  duplicadas: number;
  rechazadas: { clave: string; etiqueta: string; motivo: string }[];
  pendientes_totales: number;
}

export interface NuevoHorario {
  nombre: string;
  hora: string;
  dias: string;
  activo: boolean;
  aviso_segundos: number;
  max_items: number | null;
}
