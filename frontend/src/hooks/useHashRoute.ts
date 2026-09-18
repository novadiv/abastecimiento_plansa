import { useCallback, useEffect, useState } from 'react';

export type Route =
  | 'dashboard'
  | 'data'
  | 'analysis'
  | 'mis-compras'
  | 'abastecimiento'
  | 'rotacion'
  | 'administracion'
  | 'settings';

const VALID_ROUTES: Route[] = [
  'dashboard',
  'data',
  'analysis',
  'mis-compras',
  'abastecimiento',
  'rotacion',
  'administracion',
  'settings',
];

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return (VALID_ROUTES as string[]).includes(hash) ? (hash as Route) : 'dashboard';
}

/**
 * Router mínimo basado en el hash de la URL. Evita depender de una
 * librería de routing para una app de pocas páginas, manteniendo soporte
 * para botón "atrás" del navegador y URLs compartibles.
 */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseHash());
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    window.location.hash = `/${next}`;
  }, []);

  return { route, navigate };
}
