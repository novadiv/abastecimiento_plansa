import { useMemo } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { resolveResponsable } from '@/config/responsableMapping';

/** Responsable de Requerimientos asociado al usuario de sesión actual (o null si no está configurado). */
export function useResponsable(): { responsable: string | null; usuario: string | null } {
  const { user } = useAuthContext();

  const responsable = useMemo(() => (user ? resolveResponsable(user.usuario) : null), [user]);

  return { responsable, usuario: user?.usuario ?? null };
}
