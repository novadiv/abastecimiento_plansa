import { Component, type ReactNode } from 'react';
import { ErrorState } from './ErrorState';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Red de seguridad a nivel de app: sin esto, cualquier excepción no
 * capturada durante el render (ej. un campo inesperado en una respuesta
 * real de la API) deja la pantalla completamente en blanco, sin ningún
 * mensaje — un error real ya nos pasó así. Con este boundary, ese mismo
 * error muestra un `ErrorState` con la opción de recargar, en vez de nada.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('Error no controlado en la aplicación:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
          <div className="w-full max-w-md">
            <ErrorState
              title="Ocurrió un error inesperado."
              message={`${this.state.error.message || 'La página no pudo mostrarse correctamente.'} Recarga para intentar de nuevo — si persiste, avisa qué estabas haciendo cuando pasó.`}
              onRetry={() => window.location.reload()}
            />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
