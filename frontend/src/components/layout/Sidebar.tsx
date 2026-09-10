import { BarChart3, LayoutDashboard, LogOut, Repeat, Settings, ShoppingBag, Table2, X } from 'lucide-react';
import type { Route } from '@/hooks/useHashRoute';
import { useAuthContext } from '@/context/AuthContext';

interface NavItem {
  route: Route;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { route: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { route: 'data', label: 'Datos', icon: Table2 },
  { route: 'analysis', label: 'Análisis', icon: BarChart3 },
  { route: 'mis-compras', label: 'Mis Compras', icon: ShoppingBag },
  { route: 'rotacion', label: 'Materiales y Rotación', icon: Repeat },
  { route: 'settings', label: 'Configuración', icon: Settings },
];

interface SidebarPanelProps {
  currentRoute: Route;
  onNavigate: (route: Route) => void;
  onClose: () => void;
}

function SidebarPanel({ currentRoute, onNavigate, onClose }: SidebarPanelProps) {
  const { user, logout } = useAuthContext();

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <BarChart3 size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-slate-800">Abastecimiento</p>
            <p className="text-[11px] leading-tight text-slate-400">Dashboard de datos</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ route, label, icon: Icon }) => {
          const isActive = currentRoute === route;
          return (
            <button
              key={route}
              type="button"
              onClick={() => {
                onNavigate(route);
                onClose();
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.25 : 1.75} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        {user && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="truncate text-xs font-medium text-slate-700" title={user.nombre_completo}>
              {user.nombre_completo}
            </p>
            <p className="text-[11px] text-slate-400">
              {user.usuario} · {user.rol}
            </p>
            <button
              type="button"
              onClick={() => void logout()}
              className="btn-ghost mt-2 w-full !px-2 !py-1 text-[11px] text-rose-600 hover:bg-rose-50"
            >
              <LogOut size={12} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface SidebarProps {
  currentRoute: Route;
  onNavigate: (route: Route) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ currentRoute, onNavigate, isOpen, onClose }: SidebarProps) {
  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 lg:block">
        <SidebarPanel currentRoute={currentRoute} onNavigate={onNavigate} onClose={onClose} />
      </aside>

      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <SidebarPanel currentRoute={currentRoute} onNavigate={onNavigate} onClose={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
