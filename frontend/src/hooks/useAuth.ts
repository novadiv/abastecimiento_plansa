import { useCallback, useEffect, useState } from 'react';
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from '@/services/authService';
import { AUTH_EXPIRED_EVENT } from '@/services/apiClient';
import type { AuthStatus, AuthUser } from '@/types/auth';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  loggingIn: boolean;
}

/** Orquesta el ciclo de sesión: valida el token guardado al montar,
 * expone login/logout, y reacciona si el servidor invalida el token (401). */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    status: 'checking',
    user: null,
    error: null,
    loggingIn: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser().then(({ user, connectionError }) => {
      if (cancelled) return;
      setState({ status: user ? 'authenticated' : 'unauthenticated', user, error: connectionError, loggingIn: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleExpired() {
      setState({ status: 'unauthenticated', user: null, error: 'Tu sesión expiró. Vuelve a iniciar sesión.', loggingIn: false });
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const login = useCallback(async (usuario: string, password: string) => {
    setState((prev) => ({ ...prev, loggingIn: true, error: null }));
    try {
      const result = await loginRequest(usuario, password);
      setState({ status: 'authenticated', user: result.user, error: null, loggingIn: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No fue posible iniciar sesión.';
      setState((prev) => ({ ...prev, loggingIn: false, error: message }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setState({ status: 'unauthenticated', user: null, error: null, loggingIn: false });
  }, []);

  return { ...state, login, logout };
}

export type UseAuthReturn = ReturnType<typeof useAuth>;
