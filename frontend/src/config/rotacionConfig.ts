import { DEFAULT_ROTACION_CONFIG, type RotacionConfig } from '@/types/rotacion';

/**
 * "Configuración de criterios de rotación": los umbrales de clasificación
 * viven aquí y son editables desde la UI (sección Configuración del
 * módulo), persistidos en localStorage — nunca hay que tocar código para
 * ajustar qué es "alta" o "baja" rotación.
 */

const STORAGE_KEY = 'rotacion_config_override';

export function getRotacionConfig(): RotacionConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ROTACION_CONFIG;
    const parsed = JSON.parse(raw) as Partial<RotacionConfig>;
    return { ...DEFAULT_ROTACION_CONFIG, ...parsed };
  } catch {
    return DEFAULT_ROTACION_CONFIG;
  }
}

export function setRotacionConfig(config: RotacionConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage no disponible — el cambio solo dura la sesión actual (queda en memoria del contexto).
  }
}

export function resetRotacionConfig(): RotacionConfig {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
  return DEFAULT_ROTACION_CONFIG;
}
