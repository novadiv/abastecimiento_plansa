import { useCallback, useState } from 'react';
import { getRotacionConfig, resetRotacionConfig, setRotacionConfig } from '@/config/rotacionConfig';
import type { RotacionConfig } from '@/types/rotacion';

/** Estado reactivo de los umbrales de rotación — persistidos en localStorage, editables sin tocar código. */
export function useRotacionConfig() {
  const [config, setConfigState] = useState<RotacionConfig>(getRotacionConfig());

  const updateConfig = useCallback((patch: Partial<RotacionConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      setRotacionConfig(next);
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setConfigState(resetRotacionConfig());
  }, []);

  return { config, updateConfig, resetConfig };
}
