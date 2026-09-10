/**
 * "Mis Compras" necesita saber a qué `responsable` (campo real de
 * Requerimientos) corresponde cada usuario que inicia sesión en el
 * dashboard. La API no relaciona ambos conceptos, así que se mantiene
 * aquí un mapeo explícito y editable — nunca inferido/adivinado.
 *
 * Para agregar un nuevo comprador con su propio espacio de "Mis Compras":
 * agregar una línea `usuarioLogin: 'NOMBRE RESPONSABLE EXACTO'` (el nombre
 * debe coincidir tal cual aparece en el filtro "Responsable" del sistema).
 */
export const RESPONSABLE_BY_USUARIO: Record<string, string> = {
  jcamacho: '********',
  logistica_03: '******',
};

const OVERRIDE_STORAGE_KEY = 'mis_compras_responsable_override';

function normalizeUsuario(usuario: string): string {
  return usuario.trim().toLowerCase();
}

/** Permite que, desde el propio navegador, alguien corrija/asigne su responsable
 * sin necesidad de editar código (útil mientras se configura un usuario nuevo). */
export function setResponsableOverride(usuario: string, responsable: string): void {
  try {
    const raw = window.localStorage.getItem(OVERRIDE_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[normalizeUsuario(usuario)] = responsable;
    window.localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage no disponible — la asignación solo dura la sesión actual (no persistida).
  }
}

function getResponsableOverride(usuario: string): string | null {
  try {
    const raw = window.localStorage.getItem(OVERRIDE_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[normalizeUsuario(usuario)] ?? null;
  } catch {
    return null;
  }
}

/** Resuelve el `responsable` de Requerimientos asociado al usuario de sesión actual. */
export function resolveResponsable(usuario: string): string | null {
  const override = getResponsableOverride(usuario);
  if (override) return override;

  const normalized = normalizeUsuario(usuario);
  const match = Object.entries(RESPONSABLE_BY_USUARIO).find(([key]) => normalizeUsuario(key) === normalized);
  return match ? match[1] : null;
}
