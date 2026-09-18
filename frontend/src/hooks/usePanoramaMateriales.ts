import { useMemo } from 'react';
import { useConsolidadoResponsable } from '@/hooks/useConsolidadoResponsable';
import { buildPanorama } from '@/utils/panoramaCalculations';
import { filtrarRecordsPorPeriodo, type PeriodoFiltro } from '@/utils/filtroAnio';

/**
 * Vista "Panorama de Materiales" derivada del catálogo crudo compartido
 * (`useConsolidadoResponsable`) — clasifica Alta/Media/Estacional/Baja sobre
 * el historial del responsable. El filtro de periodo se aplica aquí, en el
 * cliente (ver `utils/filtroAnio.ts`), no en el fetch.
 */
export function usePanoramaMateriales(responsable: string | null, periodo?: PeriodoFiltro) {
  const { registros, loading, progress, error, lastUpdated, refresh } = useConsolidadoResponsable(responsable);
  const materiales = useMemo(() => buildPanorama(filtrarRecordsPorPeriodo(registros, periodo)), [registros, periodo]);

  return { materiales, loading, progress, error, lastUpdated, refresh };
}

export type UsePanoramaMaterialesReturn = ReturnType<typeof usePanoramaMateriales>;
