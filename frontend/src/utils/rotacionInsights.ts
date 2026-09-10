import type { ChartConfig } from '@/types/dashboard';
import type { KPIDefinition } from '@/types/dashboard';
import type { ProductoRotacion, RotacionConfig, RotacionNivel } from '@/types/rotacion';
import { computeAltoValorThreshold, MES_NOMBRES } from './rotacionCalculations';
import { formatCompactCurrency, formatCompactNumber, formatNumber, formatPercent } from './formatters';

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

// ---------------------------------------------------------------------------
// KPIs generales
// ---------------------------------------------------------------------------

export function buildRotacionKpis(materiales: ProductoRotacion[], config: RotacionConfig): KPIDefinition[] {
  const total = materiales.length;
  const porNivel = (nivel: RotacionNivel) => materiales.filter((m) => m.nivel === nivel).length;
  const activos = materiales.filter((m) => m.estado === 'activo').length;
  const estacionales = materiales.filter((m) => m.esEstacional).length;
  const valorTotal = sum(materiales.map((m) => m.valorEstimado ?? 0));

  const pct = (n: number) => (total > 0 ? formatPercent((n / total) * 100, 0) : '0%');

  return [
    {
      id: 'total-materiales',
      label: 'Total de materiales analizados',
      value: formatNumber(total),
      rawValue: total,
      available: true,
      icon: 'database',
      accent: 'brand',
      helpText: 'Materiales con al menos un movimiento (requerimiento) registrado.',
    },
    {
      id: 'materiales-activos',
      label: 'Materiales activos',
      value: `${formatNumber(activos)} (${pct(activos)})`,
      rawValue: activos,
      available: true,
      icon: 'check-circle',
      accent: 'emerald',
      helpText: `Con movimiento dentro de los últimos ${config.diasSinMovimiento} días.`,
    },
    {
      id: 'alta-rotacion',
      label: 'Alta rotación',
      value: `${formatNumber(porNivel('alta'))} (${pct(porNivel('alta'))})`,
      rawValue: porNivel('alta'),
      available: true,
      icon: 'trending-up',
      accent: 'rose',
    },
    {
      id: 'media-rotacion',
      label: 'Media rotación',
      value: `${formatNumber(porNivel('media'))} (${pct(porNivel('media'))})`,
      rawValue: porNivel('media'),
      available: true,
      icon: 'gauge',
      accent: 'amber',
    },
    {
      id: 'baja-rotacion',
      label: 'Baja rotación',
      value: `${formatNumber(porNivel('baja'))} (${pct(porNivel('baja'))})`,
      rawValue: porNivel('baja'),
      available: true,
      icon: 'trending-down',
      accent: 'slate',
    },
    {
      id: 'sin-rotacion',
      label: `Sin rotación (+${config.diasSinMovimiento}d)`,
      value: `${formatNumber(porNivel('sinRotacion'))} (${pct(porNivel('sinRotacion'))})`,
      rawValue: porNivel('sinRotacion'),
      available: true,
      icon: 'alert-triangle',
      accent: 'slate',
    },
    {
      id: 'estacionales',
      label: 'Materiales estacionales',
      value: `${formatNumber(estacionales)} (${pct(estacionales)})`,
      rawValue: estacionales,
      available: true,
      icon: 'trending-up',
      accent: 'brand',
      helpText: 'Concentran su consumo en ciertos meses del año — ver sección "Materiales Estacionales".',
    },
    {
      id: 'total-movimientos',
      label: 'Total de movimientos',
      value: formatCompactNumber(sum(materiales.map((m) => m.movimientos))),
      rawValue: sum(materiales.map((m) => m.movimientos)),
      available: true,
      icon: 'package',
      accent: 'slate',
    },
    {
      id: 'cantidad-total',
      label: 'Cantidad total solicitada',
      value: formatCompactNumber(sum(materiales.map((m) => m.cantidadTotal))),
      rawValue: sum(materiales.map((m) => m.cantidadTotal)),
      available: true,
      icon: 'shopping-cart',
      accent: 'slate',
    },
    {
      id: 'valor-total',
      label: 'Valor total comprado (aprox.)',
      value: formatCompactCurrency(valorTotal, 'PEN'),
      rawValue: valorTotal,
      available: true,
      icon: 'dollar-sign',
      accent: 'brand',
      helpText: 'Estimado: cantidad total × último precio conocido del proveedor principal de cada material.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Comparación por nivel / Suministros vs Repuestos
// ---------------------------------------------------------------------------

export interface GrupoComparacion {
  etiqueta: string;
  cantidadMateriales: number;
  porcentajeDelTotal: number;
  movimientos: number;
  cantidadTotal: number;
  valorTotal: number;
}

function summarize(materiales: ProductoRotacion[], totalGeneral: number, etiqueta: string): GrupoComparacion {
  return {
    etiqueta,
    cantidadMateriales: materiales.length,
    porcentajeDelTotal: totalGeneral > 0 ? (materiales.length / totalGeneral) * 100 : 0,
    movimientos: sum(materiales.map((m) => m.movimientos)),
    cantidadTotal: sum(materiales.map((m) => m.cantidadTotal)),
    valorTotal: sum(materiales.map((m) => m.valorEstimado ?? 0)),
  };
}

const NIVEL_LABEL: Record<RotacionNivel, string> = {
  alta: 'Alta rotación',
  media: 'Media rotación',
  baja: 'Baja rotación',
  sinRotacion: 'Sin rotación',
};

export function buildComparacionPorNivel(materiales: ProductoRotacion[]): GrupoComparacion[] {
  const total = materiales.length;
  return (['alta', 'media', 'baja', 'sinRotacion'] as RotacionNivel[]).map((nivel) =>
    summarize(materiales.filter((m) => m.nivel === nivel), total, NIVEL_LABEL[nivel]),
  );
}

export function buildComparacionSuministrosRepuestos(materiales: ProductoRotacion[]): GrupoComparacion[] {
  const total = materiales.length;
  return [
    summarize(materiales.filter((m) => m.tipoMaterial === 'suministro'), total, 'Suministros'),
    summarize(materiales.filter((m) => m.tipoMaterial === 'repuesto'), total, 'Repuestos'),
  ];
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export interface AlertaRotacion {
  id: string;
  tipo: 'sin-movimiento' | 'alto-valor-baja-rotacion' | 'estacional';
  material: ProductoRotacion;
  mensaje: string;
}

export function buildAlertas(materiales: ProductoRotacion[], config: RotacionConfig): AlertaRotacion[] {
  const alertas: AlertaRotacion[] = [];
  const umbralValor = computeAltoValorThreshold(materiales, config.percentilAltoValor);

  materiales.forEach((m) => {
    if (m.nivel === 'sinRotacion') {
      alertas.push({
        id: `sin-mov-${m.codigo}`,
        tipo: 'sin-movimiento',
        material: m,
        mensaje: `Sin movimiento hace ${formatNumber(m.diasSinMovimiento ?? 0)} días${
          m.stockActual !== null && m.stockActual > 0 ? ` — tiene ${formatNumber(m.stockActual, 1)} en stock: evaluar sobrestock/obsolescencia.` : '.'
        }`,
      });
    }
    if ((m.nivel === 'baja' || m.nivel === 'sinRotacion') && m.valorEstimado !== null && m.valorEstimado >= umbralValor && umbralValor > 0) {
      alertas.push({
        id: `alto-valor-${m.codigo}`,
        tipo: 'alto-valor-baja-rotacion',
        material: m,
        mensaje: `Valor acumulado alto (${formatCompactCurrency(m.valorEstimado, 'PEN')}) con baja/nula rotación — revisar antes de repetir la compra.`,
      });
    }
    if (m.esEstacional && m.mesMayorConsumo) {
      alertas.push({
        id: `estacional-${m.codigo}`,
        tipo: 'estacional',
        material: m,
        mensaje: `Material estacional — mayor demanda en ${m.mesMayorConsumo}. Considerar compra anticipada antes de esa temporada.`,
      });
    }
  });

  return alertas;
}

// ---------------------------------------------------------------------------
// Panorama ejecutivo (texto auto-generado)
// ---------------------------------------------------------------------------

export function buildPanoramaEjecutivo(materiales: ProductoRotacion[], config: RotacionConfig): string[] {
  if (materiales.length === 0) return [];
  const frases: string[] = [];

  const masMovido = [...materiales].sort((a, b) => b.movimientos - a.movimientos)[0];
  if (masMovido) {
    frases.push(`El material que más sale es "${masMovido.producto}" (${masMovido.codigo}), con ${formatNumber(masMovido.movimientos)} movimientos registrados.`);
  }

  const repuestos = materiales.filter((m) => m.tipoMaterial === 'repuesto').sort((a, b) => b.movimientos - a.movimientos)[0];
  if (repuestos) {
    frases.push(`Entre los repuestos, el de mayor movimiento es "${repuestos.producto}" (${repuestos.codigo}).`);
  }

  const suministros = materiales.filter((m) => m.tipoMaterial === 'suministro').sort((a, b) => b.movimientos - a.movimientos)[0];
  if (suministros) {
    frases.push(`Entre los suministros, el de mayor rotación es "${suministros.producto}" (${suministros.codigo}).`);
  }

  const sinRotacion = materiales.filter((m) => m.nivel === 'sinRotacion');
  if (sinRotacion.length > 0) {
    frases.push(`${formatNumber(sinRotacion.length)} materiales llevan más de ${config.diasSinMovimiento} días sin movimiento — revisar posible inmovilización de stock.`);
  }

  const estacionales = materiales.filter((m) => m.esEstacional);
  if (estacionales.length > 0) {
    frases.push(`${formatNumber(estacionales.length)} materiales muestran un patrón estacional claro — conviene planificar su compra antes de su temporada de mayor demanda.`);
  }

  const porValor = [...materiales].sort((a, b) => (b.valorEstimado ?? 0) - (a.valorEstimado ?? 0))[0];
  if (porValor?.valorEstimado) {
    frases.push(`El gasto se concentra principalmente en "${porValor.producto}" (${formatCompactCurrency(porValor.valorEstimado, 'PEN')} aprox.).`);
  }

  const umbralValor = computeAltoValorThreshold(materiales, config.percentilAltoValor);
  const altoValorBaja = materiales.filter((m) => (m.nivel === 'baja' || m.nivel === 'sinRotacion') && (m.valorEstimado ?? 0) >= umbralValor && umbralValor > 0);
  if (altoValorBaja.length > 0) {
    frases.push(`${formatNumber(altoValorBaja.length)} materiales tienen alto valor acumulado pero baja o nula rotación — candidatos a revisión.`);
  }

  return frases;
}

// ---------------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------------

export function buildRotacionCharts(materiales: ProductoRotacion[]): ChartConfig[] {
  if (materiales.length === 0) return [];
  const charts: ChartConfig[] = [];

  charts.push({
    id: 'distribucion-nivel',
    kind: 'pie',
    title: 'Distribución de materiales por nivel de rotación',
    subtitle: 'Según los filtros aplicados',
    data: (['alta', 'media', 'baja', 'sinRotacion'] as RotacionNivel[]).map((nivel) => ({
      name: NIVEL_LABEL[nivel],
      value: materiales.filter((m) => m.nivel === nivel).length,
    })),
    series: [{ key: 'value', label: 'Materiales' }],
    nameKey: 'name',
    valueFormat: 'number',
  });

  const topConsumo = [...materiales].sort((a, b) => b.cantidadTotal - a.cantidadTotal).slice(0, 10);
  charts.push({
    id: 'top-consumo',
    kind: 'bar',
    title: 'Top 10 materiales con mayor consumo',
    subtitle: 'Cantidad total solicitada (histórico)',
    data: topConsumo.map((m) => ({ name: m.codigo, value: m.cantidadTotal })),
    series: [{ key: 'value', label: 'Cantidad total' }],
    nameKey: 'name',
    valueFormat: 'number',
  });

  const menorMovimiento = materiales
    .filter((m) => m.movimientos > 0)
    .sort((a, b) => a.movimientos - b.movimientos)
    .slice(0, 10);
  charts.push({
    id: 'menor-movimiento',
    kind: 'bar',
    title: 'Materiales con menor movimiento',
    subtitle: 'Menor número de salidas registradas (entre los que sí tienen movimiento)',
    data: menorMovimiento.map((m) => ({ name: m.codigo, value: m.movimientos })),
    series: [{ key: 'value', label: 'Movimientos' }],
    nameKey: 'name',
    valueFormat: 'number',
  });

  const consumoMensualGlobal = MES_NOMBRES.map((mes, i) => ({
    name: mes.slice(0, 3),
    value: sum(materiales.map((m) => m.consumoPorMes[i] ?? 0)),
  }));
  charts.push({
    id: 'consumo-mensual-global',
    kind: 'bar',
    title: 'Consumo total por mes (todos los años agregados)',
    subtitle: 'Cantidad solicitada por mes calendario, sumando todo el historial disponible',
    data: consumoMensualGlobal,
    series: [{ key: 'value', label: 'Cantidad' }],
    nameKey: 'name',
    valueFormat: 'number',
  });

  const estacionales = materiales.filter((m) => m.esEstacional);
  if (estacionales.length > 0) {
    const consumoMensualEstacional = MES_NOMBRES.map((mes, i) => ({
      name: mes.slice(0, 3),
      value: sum(estacionales.map((m) => m.consumoPorMes[i] ?? 0)),
    }));
    charts.push({
      id: 'consumo-mensual-estacional',
      kind: 'bar',
      title: 'Comportamiento mensual de materiales estacionales',
      subtitle: `Cantidad solicitada por mes, solo entre los ${formatNumber(estacionales.length)} materiales clasificados como estacionales`,
      data: consumoMensualEstacional,
      series: [{ key: 'value', label: 'Cantidad' }],
      nameKey: 'name',
      valueFormat: 'number',
    });
  }

  charts.push({
    id: 'suministros-vs-repuestos',
    kind: 'bar',
    title: 'Suministros vs Repuestos',
    subtitle: 'Cantidad de materiales por tipo (según filtros aplicados)',
    data: [
      { name: 'Suministros', value: materiales.filter((m) => m.tipoMaterial === 'suministro').length },
      { name: 'Repuestos', value: materiales.filter((m) => m.tipoMaterial === 'repuesto').length },
    ],
    series: [{ key: 'value', label: 'Materiales' }],
    nameKey: 'name',
    valueFormat: 'number',
  });

  return charts;
}
