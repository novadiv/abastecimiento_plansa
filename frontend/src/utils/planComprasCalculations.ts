import type { ConsolidadoProductoRecord, RequerimientoItem } from '@/types/requerimiento';
import type {
  EstadoMaterialPlan,
  MaterialPlanCompras,
  PlanComprasFilters,
  PlanComprasResumen,
  PlanProveedor,
  RequerimientoPendienteRef,
  TandaCompra,
} from '@/types/planCompras';
import { buildMaterialPanorama } from './panoramaCalculations';

/** A partir de 30+ días sin atenderse, un requerimiento pendiente se considera "urgente" para efectos de agrupar la tanda de compra. */
const DIAS_URGENCIA = 30;

function toRef(item: RequerimientoItem): RequerimientoPendienteRef {
  return {
    reqNro: item.req_nro,
    fecha: item.fecha,
    cantidad: item.cantidad,
    saldoPendiente: item.saldo_pendiente,
    diasPendiente: item.dias_pendiente,
    estadoCalculado: item.estado_calculado,
  };
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Clasifica cada requerimiento (item) del material según los campos REALES
 * que ya calcula el backend (`tiene_oc`, `saldo_pendiente`) — no se
 * reinterpreta ni se inventa un estado nuevo.
 */
function estadoItem(item: RequerimientoItem): 'atendido' | 'parcial' | 'pendiente' {
  const saldo = item.saldo_pendiente ?? 0;
  if (item.tiene_oc && saldo <= 0) return 'atendido';
  if (item.tiene_oc && saldo > 0) return 'parcial';
  if (!item.tiene_oc && saldo > 0) return 'pendiente';
  return 'atendido'; // sin OC pero sin saldo pendiente: ya resuelto (con stock, etc.)
}

export function buildMaterialPlanCompras(record: ConsolidadoProductoRecord, now = Date.now()): MaterialPlanCompras {
  const panorama = buildMaterialPanorama(record, now);
  const items = record.items ?? [];

  const pendientes: RequerimientoItem[] = [];
  const parciales: RequerimientoItem[] = [];
  let atendidos = 0;
  const ocExistentesSet = new Set<string>();

  items.forEach((item) => {
    const estado = estadoItem(item);
    if (estado === 'pendiente') pendientes.push(item);
    else if (estado === 'parcial') parciales.push(item);
    else atendidos += 1;
    if (item.tiene_oc && item.nro_oc && item.nro_oc !== 'nan') ocExistentesSet.add(item.nro_oc);
  });

  const esConsolidable = pendientes.length >= 2;
  const estadoGeneral: EstadoMaterialPlan = esConsolidable
    ? 'consolidable'
    : pendientes.length === 1
      ? 'pendiente'
      : parciales.length > 0
        ? 'parcial'
        : 'atendido';

  const cantidadPendienteTotal = sum([...pendientes, ...parciales].map((i) => i.saldo_pendiente ?? 0));

  const diasMax = Math.max(0, ...[...pendientes, ...parciales].map((i) => i.dias_pendiente ?? 0));
  const tanda: TandaCompra | null = pendientes.length === 0 && parciales.length === 0 ? null : diasMax >= DIAS_URGENCIA ? 'urgente' : 'programada';

  return {
    codigo: record.codigo_producto,
    producto: record.producto,
    familia: record.familia,
    unidadMedida: record.um,
    proveedorSugerido: panorama.proveedorPrincipal,
    precioReferencia: panorama.precioReferencia,
    monedaReferencia: panorama.monedaReferencia,
    nivel: panorama.nivel,
    requerimientosPendientes: pendientes.map(toRef),
    requerimientosParciales: parciales.map(toRef),
    requerimientosAtendidos: atendidos,
    reqNumerosPendientes: [...pendientes, ...parciales].map((i) => i.req_nro),
    esConsolidable,
    estadoGeneral,
    tanda,
    cantidadPendienteTotal,
    valorEstimadoPendiente: panorama.precioReferencia != null ? cantidadPendienteTotal * panorama.precioReferencia : null,
    ocExistentes: Array.from(ocExistentesSet),
  };
}

export function buildPlanCompras(records: ConsolidadoProductoRecord[]): MaterialPlanCompras[] {
  return records.map((r) => buildMaterialPlanCompras(r)).sort((a, b) => b.cantidadPendienteTotal - a.cantidadPendienteTotal);
}

export function applyPlanComprasFilters(materiales: MaterialPlanCompras[], filters: PlanComprasFilters): MaterialPlanCompras[] {
  const term = filters.search?.trim().toLowerCase();
  return materiales.filter((m) => {
    if (filters.proveedores && filters.proveedores.length > 0 && !filters.proveedores.includes(m.proveedorSugerido ?? '')) return false;
    if (filters.estados && filters.estados.length > 0 && !filters.estados.includes(m.estadoGeneral)) return false;
    if (filters.niveles && filters.niveles.length > 0 && !filters.niveles.includes(m.nivel)) return false;
    if (filters.tanda && m.tanda !== filters.tanda) return false;
    if (term) {
      const haystack = `${m.codigo} ${m.producto}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

/** Solo lo que realmente hay que comprar (pendiente o parcial, con saldo > 0) — la base del plan de compras. */
export function soloConNecesidadDeCompra(materiales: MaterialPlanCompras[]): MaterialPlanCompras[] {
  return materiales.filter((m) => m.cantidadPendienteTotal > 0);
}

export function buildPlanPorProveedor(materiales: MaterialPlanCompras[]): PlanProveedor[] {
  const conNecesidad = soloConNecesidadDeCompra(materiales);
  const grupos = new Map<string, MaterialPlanCompras[]>();

  conNecesidad.forEach((m) => {
    const key = m.proveedorSugerido ?? 'Proveedor no identificado';
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(m);
  });

  const proveedores: PlanProveedor[] = Array.from(grupos.entries()).map(([proveedor, mats]) => {
    const tandas = Array.from(new Set(mats.map((m) => m.tanda).filter((t): t is TandaCompra => t !== null)));
    const reqUnicos = new Set(mats.flatMap((m) => m.reqNumerosPendientes));
    return {
      proveedor,
      materiales: mats,
      nRequerimientosPendientes: reqUnicos.size,
      nCodigos: mats.length,
      cantidadTotalUnidades: sum(mats.map((m) => m.cantidadPendienteTotal)),
      montoEstimado: mats.some((m) => m.valorEstimadoPendiente !== null) ? sum(mats.map((m) => m.valorEstimadoPendiente ?? 0)) : null,
      ocRecomendadas: Math.max(1, tandas.length),
      tandas: tandas.length > 0 ? tandas : ['programada'],
    };
  });

  return proveedores.sort((a, b) => b.cantidadTotalUnidades - a.cantidadTotalUnidades);
}

/** Materiales que aparecen en 2+ requerimientos pendientes distintos — sección "Materiales que se están solicitando repetidamente". */
export function buildMaterialesRepetidos(materiales: MaterialPlanCompras[]): MaterialPlanCompras[] {
  return soloConNecesidadDeCompra(materiales)
    .filter((m) => m.esConsolidable)
    .sort((a, b) => b.reqNumerosPendientes.length - a.reqNumerosPendientes.length);
}

export function buildPlanComprasResumen(materiales: MaterialPlanCompras[], proveedores: PlanProveedor[]): PlanComprasResumen {
  const conNecesidad = soloConNecesidadDeCompra(materiales);
  const reqUnicosPendientes = new Set(conNecesidad.flatMap((m) => m.reqNumerosPendientes));
  const ocExistentesGlobal = new Set(materiales.flatMap((m) => m.ocExistentes));
  const requerimientosAnalizados = new Set(materiales.flatMap((m) => [...m.requerimientosPendientes, ...m.requerimientosParciales].map((r) => r.reqNro))).size + materiales.reduce((acc, m) => acc + m.requerimientosAtendidos, 0);

  const ocRecomendadas = sum(proveedores.map((p) => p.ocRecomendadas));
  const ocSinConsolidar = reqUnicosPendientes.size; // hipotético: 1 OC por requerimiento pendiente, sin agrupar

  return {
    requerimientosAnalizados,
    requerimientosPendientesUnicos: reqUnicosPendientes.size,
    materialesAComprar: conNecesidad.length,
    materialesRepetidos: conNecesidad.filter((m) => m.esConsolidable).length,
    proveedoresInvolucrados: proveedores.length,
    ocActuales: ocExistentesGlobal.size,
    ocSinConsolidar,
    ocRecomendadas,
    ocEvitables: Math.max(0, ocSinConsolidar - ocRecomendadas),
    montoEstimado: sum(conNecesidad.map((m) => m.valorEstimadoPendiente ?? 0)),
  };
}
