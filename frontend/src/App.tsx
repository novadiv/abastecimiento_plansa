import { AuthProvider, useAuthContext } from '@/context/AuthContext';
import { ProductosProvider } from '@/context/ProductosContext';
import { useHashRoute } from '@/hooks/useHashRoute';
import { Layout } from '@/components/layout/Layout';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { LoadingState } from '@/components/common/LoadingState';
import { Dashboard } from '@/pages/Dashboard';
import { Data } from '@/pages/Data';
import { Analysis } from '@/pages/Analysis';
import { MisCompras } from '@/pages/MisCompras';
import { Rotacion } from '@/pages/Rotacion';
import { Settings } from '@/pages/Settings';

function Router() {
  const { route, navigate } = useHashRoute();

  const pages = {
    dashboard: <Dashboard />,
    data: <Data />,
    analysis: <Analysis />,
    'mis-compras': <MisCompras />,
    rotacion: <Rotacion />,
    settings: <Settings />,
  } as const;

  return (
    <Layout route={route} onNavigate={navigate}>
      {pages[route]}
    </Layout>
  );
}

function AuthGate() {
  const { status } = useAuthContext();

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingState message="Verificando sesión..." />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginScreen />;
  }

  return (
    <ProductosProvider>
      <Router />
    </ProductosProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
