import { useMemo } from 'react';
import { useConsolidadoResponsable } from '@/hooks/useConsolidadoResponsable';
import { buildPlanCompras } from '@/utils/planComprasCalculations';
import { filtrarRecordsPorPeriodo, type PeriodoFiltro } from '@/utils/filtroAnio';

/** "Plan de Compras (2 meses)" derivado del mismo catálogo crudo compartido; el filtro de periodo se aplica en el cliente. */
export function usePlanCompras(responsable: string | null, periodo?: PeriodoFiltro) {
  const { registros, loading, progress, error, lastUpdated, refresh } = useConsolidadoResponsable(responsable);
  const materiales = useMemo(() => buildPlanCompras(filtrarRecordsPorPeriodo(registros, periodo)), [registros, periodo]);

  return { materiales, loading, progress, error, lastUpdated, refresh };
}

export type UsePlanComprasReturn = ReturnType<typeof usePlanCompras>;
