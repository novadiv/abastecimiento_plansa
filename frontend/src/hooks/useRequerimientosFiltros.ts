import { useEffect, useState } from 'react';
import { fetchRequerimientosFiltros } from '@/services/requerimientosService';
import type { RequerimientosFiltrosOptions } from '@/types/requerimiento';

const EMPTY: RequerimientosFiltrosOptions = {
  años: [],
  familias: [],
  areas: [],
  responsables: [],
  estados_normalizados: [],
  proveedores: [],
};

/** Catálogo de valores disponibles para los selects de filtro (global, no depende del responsable). */
export function useRequerimientosFiltros() {
  const [options, setOptions] = useState<RequerimientosFiltrosOptions>(EMPTY);

  useEffect(() => {
    fetchRequerimientosFiltros()
      .then(setOptions)
      .catch(() => setOptions(EMPTY));
  }, []);

  return options;
}
