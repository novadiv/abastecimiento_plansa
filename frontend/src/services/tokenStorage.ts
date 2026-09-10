/** Persistencia del token de sesión. Aislado en su propio módulo para poder
 * cambiar de estrategia (p. ej. sessionStorage) sin tocar el resto de la app. */

const TOKEN_KEY = 'abastecimiento_dashboard_auth_token';

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage no disponible (modo privado, cuota excedida, etc.) — la sesión
    // seguirá funcionando en memoria durante la pestaña actual.
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // no-op
  }
}
