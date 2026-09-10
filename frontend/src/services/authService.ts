import { apiClient, ApiError } from './apiClient';
import { getToken, setToken, clearToken } from './tokenStorage';
import type { AuthUser, LoginResult, Permisos } from '@/types/auth';

/**
 * Autenticación contra la API interna (`/api/auth/*`). Replica el
 * contrato ya usado por el sistema de Logística existente: login con
 * `{usuario, password}`, token Bearer persistido en el cliente.
 */

interface LoginApiResponse {
  success: boolean;
  token: string;
  usuario: string;
  nombre_completo: string;
  rol: string;
  permisos: Permisos;
  expires_in_days: number;
  detail?: string;
}

interface MeApiResponse {
  user: AuthUser;
}

export async function login(usuario: string, password: string): Promise<LoginResult> {
  const response = await apiClient.post<LoginApiResponse>(
    '/auth/login',
    { usuario, password },
    { authenticated: false },
  );

  if (!response.success) {
    throw new ApiError(response.detail ?? 'Usuario o contraseña incorrectos.', 401);
  }

  setToken(response.token);

  return {
    token: response.token,
    expiresInDays: response.expires_in_days,
    user: {
      usuario: response.usuario,
      nombre_completo: response.nombre_completo,
      rol: response.rol,
      permisos: response.permisos ?? {},
    },
  };
}

export async function logout(): Promise<void> {
  try {
    if (getToken()) {
      await apiClient.post('/auth/logout');
    }
  } catch {
    // Si la llamada de logout falla (servidor caído, token ya vencido, etc.)
    // igual limpiamos la sesión local — no debe bloquear el cierre de sesión.
  } finally {
    clearToken();
  }
}

export interface CurrentUserResult {
  user: AuthUser | null;
  /** Mensaje si la verificación falló por conectividad (servidor caído/inalcanzable),
   * en cuyo caso NO se borra el token — puede que la sesión siga siendo válida. */
  connectionError: string | null;
}

/** Valida el token guardado contra el servidor. */
export async function fetchCurrentUser(): Promise<CurrentUserResult> {
  if (!getToken()) return { user: null, connectionError: null };
  try {
    const response = await apiClient.get<MeApiResponse>('/auth/me');
    return { user: response.user, connectionError: null };
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      // No se pudo contactar al servidor — no invalidamos el token, solo lo informamos.
      return { user: null, connectionError: err.message };
    }
    clearToken();
    return { user: null, connectionError: null };
  }
}
