export const MES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Heurística de estacionalidad (compartida por "Materiales y Rotación" y por
// "Panorama de Materiales" en Mis Compras): se requiere evidencia mínima
// (movimientos repartidos en varios meses distintos) antes de calificar algo
// como estacional — si no, se reporta como "sin evidencia suficiente" y no
// se estima nada. Ver docs/analisis_plan_compras.md para el mismo criterio
// aplicado fuera del frontend (a través de MongoDB directo).
const ESTACIONALIDAD_MIN_MESES_CON_DATOS = 4;
const ESTACIONALIDAD_MIN_MOVIMIENTOS = 6;
// El mes de mayor consumo debe superar al promedio mensual en al menos este % para considerarse un pico estacional real.
const ESTACIONALIDAD_UMBRAL_VARIACION_PCT = 60;

export interface EstacionalidadInfo {
  consumoPorMes: number[];
  esEstacional: boolean;
  mesMayorConsumo: string | null;
  variacionConsumoPct: number | null;
}

/**
 * Agrupa el consumo real (cantidad solicitada) por mes calendario, sumando
 * todos los años del historial disponible. Solo se declara "estacional" un
 * material cuando hay evidencia suficiente (movimientos repartidos en varios
 * meses distintos) — si no, se reporta como "sin evidencia suficiente" y no
 * se estima nada.
 */
export function buildEstacionalidad(fechasConCantidad: { ms: number; cantidad: number }[]): EstacionalidadInfo {
  const consumoPorMes = new Array(12).fill(0) as number[];
  const mesesConDatos = new Set<number>();

  fechasConCantidad.forEach(({ ms, cantidad }) => {
    const mes = new Date(ms).getMonth();
    consumoPorMes[mes] += cantidad || 0;
    mesesConDatos.add(mes);
  });

  const totalConsumo = consumoPorMes.reduce((a, b) => a + b, 0);
  const evidenciaSuficiente = mesesConDatos.size >= ESTACIONALIDAD_MIN_MESES_CON_DATOS && fechasConCantidad.length >= ESTACIONALIDAD_MIN_MOVIMIENTOS;

  if (!evidenciaSuficiente || totalConsumo <= 0) {
    return { consumoPorMes, esEstacional: false, mesMayorConsumo: null, variacionConsumoPct: null };
  }

  const promedio = totalConsumo / 12;
  let mesPicoIdx = 0;
  consumoPorMes.forEach((v, i) => {
    if (v > consumoPorMes[mesPicoIdx]) mesPicoIdx = i;
  });

  const variacionConsumoPct = promedio > 0 ? ((consumoPorMes[mesPicoIdx] - promedio) / promedio) * 100 : 0;

  return {
    consumoPorMes,
    esEstacional: variacionConsumoPct >= ESTACIONALIDAD_UMBRAL_VARIACION_PCT,
    mesMayorConsumo: MES_NOMBRES[mesPicoIdx],
    variacionConsumoPct,
  };
}
