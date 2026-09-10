import { useEffect, useState } from 'react';
import { fetchFamilias, fetchLineas } from '@/services/productosService';
import type { CatalogoOpcion } from '@/types/producto';

/** Opciones para los selects de Familia / Línea. Línea se recarga cuando cambia la familia elegida. */
export function useFamiliasLineas(familia: string | undefined) {
  const [familias, setFamilias] = useState<CatalogoOpcion[]>([]);
  const [lineas, setLineas] = useState<CatalogoOpcion[]>([]);

  useEffect(() => {
    fetchFamilias()
      .then(setFamilias)
      .catch(() => setFamilias([]));
  }, []);

  useEffect(() => {
    fetchLineas(familia)
      .then(setLineas)
      .catch(() => setLineas([]));
  }, [familia]);

  return { familias, lineas };
}
