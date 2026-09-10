import { Menu, RefreshCw } from 'lucide-react';
import { useProductosContext } from '@/context/ProductosContext';
import { formatDateTime } from '@/utils/formatters';

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  data: 'Datos',
  analysis: 'Análisis',
  'mis-compras': 'Mis Compras',
  rotacion: 'Análisis de Materiales y Rotación',
  settings: 'Configuración',
};

interface HeaderProps {
  title: string;
  onOpenSidebar: () => void;
}

export function Header({ title, onOpenSidebar }: HeaderProps) {
  const { dashboardKpis, loading, refetch, refetchDashboardKpis } = useProductosContext();

  function handleRefresh() {
    refetch();
    refetchDashboardKpis();
  }

  return (
    <header className="sticky top-0 z-30 flex flex-col gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onOpenSidebar} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden">
          <Menu size={20} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-slate-800">{PAGE_TITLES[title] ?? title}</h1>
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Conectado en vivo · Último cálculo {formatDateTime(dashboardKpis?.ultimo_calculo)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleRefresh} className="btn-secondary" disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>
    </header>
  );
}
