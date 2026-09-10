import { Database, LogOut, Server, ShieldCheck } from 'lucide-react';
import { useAuthContext } from '@/context/AuthContext';
import { API_BASE_URL } from '@/services/apiClient';
import { useProductosContext } from '@/context/ProductosContext';
import { formatDateTime } from '@/utils/formatters';

export function Settings() {
  const { user, logout } = useAuthContext();
  const { dashboardKpis, total } = useProductosContext();

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Server size={16} className="text-brand-600" /> Conexión a la base de datos
        </h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoRow label="API" value={API_BASE_URL} />
          <InfoRow label="Estado" value="Conectado" />
          <InfoRow label="Productos en catálogo" value={total.toLocaleString('es-PE')} />
          <InfoRow label="Último cálculo del servidor" value={formatDateTime(dashboardKpis?.ultimo_calculo)} />
        </dl>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ShieldCheck size={16} className="text-brand-600" /> Sesión
        </h2>
        {user && (
          <div className="space-y-3">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoRow label="Usuario" value={user.usuario} />
              <InfoRow label="Nombre" value={user.nombre_completo} />
              <InfoRow label="Rol" value={user.rol} />
            </dl>
            <button
              type="button"
              onClick={() => void logout()}
              className="btn-ghost text-rose-600 hover:bg-rose-50"
            >
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Database size={16} className="text-brand-600" /> Arquitectura de datos
        </h2>
        <p className="text-sm text-slate-500">
          El dashboard consulta en vivo la API interna de Logística/Compras (
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{API_BASE_URL}</code>). La tabla y los filtros usan
          paginación y filtrado del lado del servidor (miles de productos), y los KPIs/gráficos se calculan a partir de
          los agregados que la propia API expone (<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">totales</code>{' '}
          y <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/dashboard/kpis</code>), en vez de descargar y
          procesar todo el catálogo en el navegador.
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-slate-700" title={value}>
        {value}
      </dd>
    </div>
  );
}
