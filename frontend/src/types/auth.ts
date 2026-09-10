/** Tipos del sistema de autenticación de la API interna (JWT-like bearer token). */

export type PermisoNivel = 'none' | 'read' | 'write' | 'admin';

export type Permisos = Record<string, PermisoNivel>;

export interface AuthUser {
  usuario: string;
  nombre_completo: string;
  rol: string;
  permisos: Permisos;
}

export interface LoginResult {
  user: AuthUser;
  token: string;
  expiresInDays: number;
}

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';
