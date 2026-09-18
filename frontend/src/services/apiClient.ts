import { getToken, clearToken } from './tokenStorage';

/**
 * Cliente HTTP base para la API interna de Abastecimiento/Logística.
 * Es la única capa que conoce la URL del backend y el mecanismo de
 * autenticación (Bearer token); services/*.ts la usan para hablar con
 * endpoints concretos sin repetir esta lógica.
 */

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Se dispara cuando el servidor responde 401 (token ausente/expirado), para que
 * el AuthProvider cierre la sesión y muestre la pantalla de login. */
export const AUTH_EXPIRED_EVENT = 'auth:expired';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  // No se usa URLSearchParams: codifica los espacios como "+", y el servidor
  // real (confirmado con un error de regex de MongoDB — code 51091 — al
  // mandar "JEANPIERO PEREA") no siempre lo interpreta de vuelta como
  // espacio. `encodeURIComponent` codifica el espacio como %20, que sí
  // funciona de forma consistente (verificado directamente contra la API).
  const pares = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pares.length > 0 ? `?${pares.join('&')}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Si es false, no se envía el Authorization header (usado por /auth/login). */
  authenticated?: boolean;
  /** Límite de espera para esta petición puntual (ver DEFAULT_TIMEOUT_MS). */
  timeoutMs?: number;
}

// Si el servidor no responde nada en absoluto (caído, VPN desconectada, red
// bloqueada), el navegador puede tardar minutos en darse por vencido. Con
// esto, la app nunca se queda colgada más de este tiempo — falla rápido y
// deja que la UI (login, páginas) muestre un error entendible.
//
// Algunos endpoints (ej. consolidado-producto de Requerimientos) son
// consultas pesadas del lado del servidor y de forma NORMAL tardan 15-18s
// por página — esos deben pasar explícitamente un `timeoutMs` mayor.
const DEFAULT_TIMEOUT_MS = 20_000;

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, authenticated = true, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (authenticated) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}${query ? buildQueryString(query) : ''}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(
        'El servidor no respondió a tiempo. Verifica tu conexión a la red interna (VPN/red de la empresa) e inténtalo de nuevo.',
        0,
      );
    }
    throw new ApiError('No fue posible conectar con el servidor. Verifica tu conexión a la red interna.', 0);
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Respuesta sin cuerpo JSON — se maneja abajo según el status.
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && payload !== null && 'detail' in payload
        ? String((payload as { detail?: unknown }).detail)
        : `Error HTTP ${response.status}`;
    throw new ApiError(detail, response.status);
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, query?: Record<string, string | number | undefined>, opts?: { timeoutMs?: number }) =>
    request<T>(path, { method: 'GET', query, timeoutMs: opts?.timeoutMs }),
  post: <T>(path: string, body?: unknown, opts?: { authenticated?: boolean }) =>
    request<T>(path, { method: 'POST', body, authenticated: opts?.authenticated ?? true }),
};
