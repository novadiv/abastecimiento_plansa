import type { PanoramaNivel } from './panorama';

/**
 * "Plan de Compras y Consolidación (2 meses)" — cruza los requerimientos del
 * responsable (ya cargados por el dashboard) contra la información de OC que
 * ya viaja embebida en cada uno (`tiene_oc`, `nro_oc`, `saldo_pendiente`,
 * `estado_calculado`). La API no expone una colección de Órdenes de Compra
 * separada con campo de comprador — por eso la conciliación se hace a nivel
 * de requerimiento↔OC usando exactamente los mismos campos reales que ya
 * usa el resto del dashboard, no una fuente nueva inventada.
 */

/** Estado de conciliación de UN requerimiento (item) frente a su OC. */
export type EstadoRequerimiento = 'atendido' | 'parcial' | 'pendiente';

/** Estado consolidado a nivel de material (puede haber varios requerimientos por material). */
export type EstadoMaterialPlan = 'atendido' | 'parcial' | 'pendiente' | 'consolidable';

/** Sin un campo real de "fecha requerida" futura, la urgencia de compra se deriva de
 * `dias_pendiente` (real): "urgente" = ya lleva 30+ días esperando, "programada" = reciente. */
export type TandaCompra = 'urgente' | 'programada';

export interface RequerimientoPendienteRef {
  reqNro: string;
  fecha: string | null;
  cantidad: number | null;
  saldoPendiente: number | null;
  diasPendiente: number | null;
  estadoCalculado: string | null;
}

export interface MaterialPlanCompras {
  codigo: string;
  producto: string;
  familia: string | null;
  unidadMedida: string | null;

  /** Proveedor histórico más frecuente — SUGERIDO para la compra, no una asignación confirmada. */
  proveedorSugerido: string | null;
  precioReferencia: number | null;
  monedaReferencia: string | null;

  /** Reutiliza la misma clasificación que "Panorama de Materiales" (alta/media/estacional/baja). */
  nivel: PanoramaNivel;

  requerimientosPendientes: RequerimientoPendienteRef[];
  requerimientosParciales: RequerimientoPendienteRef[];
  requerimientosAtendidos: number;
  reqNumerosPendientes: string[];

  /** true si hay 2+ requerimientos pendientes del mismo código — candidato a consolidar en 1 sola compra. */
  esConsolidable: boolean;
  estadoGeneral: EstadoMaterialPlan;
  /** null si no hay nada pendiente/parcial que comprar. */
  tanda: TandaCompra | null;

  cantidadPendienteTotal: number;
  valorEstimadoPendiente: number | null;

  /** OC ya existentes (reales, `nro_oc`) asociadas a este material — trazabilidad. */
  ocExistentes: string[];
}

export interface PlanProveedor {
  proveedor: string;
  materiales: MaterialPlanCompras[];
  nRequerimientosPendientes: number;
  nCodigos: number;
  cantidadTotalUnidades: number;
  montoEstimado: number | null;
  /** 1 si todo el proveedor cae en la misma tanda de urgencia, 2 si hay ambas (urgente + programada). */
  ocRecomendadas: number;
  tandas: TandaCompra[];
}

export interface PlanComprasResumen {
  requerimientosAnalizados: number;
  requerimientosPendientesUnicos: number;
  materialesAComprar: number;
  materialesRepetidos: number;
  proveedoresInvolucrados: number;
  ocActuales: number;
  ocSinConsolidar: number;
  ocRecomendadas: number;
  ocEvitables: number;
  montoEstimado: number;
}

export interface PlanComprasFilters {
  proveedores?: string[];
  estados?: EstadoMaterialPlan[];
  niveles?: PanoramaNivel[];
  tanda?: TandaCompra;
  search?: string;
}
