import { AlertTriangle, CalendarClock } from 'lucide-react';
import { useRotacionContext } from '@/context/RotacionContext';
import { EmptyState } from '@/components/common/EmptyState';
import { truncateText } from '@/utils/formatters';

export function AlertasPanel() {
  const { alertas, seleccionarMaterial } = useRotacionContext();

  const sinMovimiento = alertas.filter((a) => a.tipo === 'sin-movimiento');
  const altoValor = alertas.filter((a) => a.tipo === 'alto-valor-baja-rotacion');
  const estacionales = alertas.filter((a) => a.tipo === 'estacional');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="card p-5">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <AlertTriangle size={16} className="text-slate-500" /> Sin rotación / stock inmovilizado
        </h3>
        <p className="mb-3 text-xs text-slate-400">Materiales que llevan un periodo considerable sin solicitarse.</p>
        {sinMovimiento.length === 0 ? (
          <EmptyState title="Sin alertas de este tipo" />
        ) : (
          <ul className="max-h-80 space-y-2 overflow-auto">
            {sinMovimiento.slice(0, 50).map((a) => (
              <li
                key={a.id}
                className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs hover:bg-slate-100"
                onClick={() => seleccionarMaterial(a.material.codigo)}
              >
                <p className="font-medium text-slate-700">{truncateText(a.material.producto, 56)}</p>
                <p className="text-slate-400">
                  {a.material.codigo} · {a.mensaje}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-5">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <AlertTriangle size={16} className="text-rose-500" /> Alto valor + baja rotación
        </h3>
        <p className="mb-3 text-xs text-slate-400">
          Representan un monto de compra importante pero se solicitan poco — candidatos a revisar antes de repetir la compra.
        </p>
        {altoValor.length === 0 ? (
          <EmptyState title="Sin alertas de este tipo" />
        ) : (
          <ul className="max-h-80 space-y-2 overflow-auto">
            {altoValor.slice(0, 50).map((a) => (
              <li
                key={a.id}
                className="cursor-pointer rounded-lg border border-rose-100 bg-rose-50/50 p-2.5 text-xs hover:bg-rose-50"
                onClick={() => seleccionarMaterial(a.material.codigo)}
              >
                <p className="font-medium text-slate-700">{truncateText(a.material.producto, 56)}</p>
                <p className="text-slate-400">
                  {a.material.codigo} · {a.mensaje}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-5">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <CalendarClock size={16} className="text-sky-500" /> Materiales estacionales
        </h3>
        <p className="mb-3 text-xs text-slate-400">Conviene planificar la compra antes de su temporada de mayor demanda.</p>
        {estacionales.length === 0 ? (
          <EmptyState title="Sin alertas de este tipo" />
        ) : (
          <ul className="max-h-80 space-y-2 overflow-auto">
            {estacionales.slice(0, 50).map((a) => (
              <li
                key={a.id}
                className="cursor-pointer rounded-lg border border-sky-100 bg-sky-50/50 p-2.5 text-xs hover:bg-sky-50"
                onClick={() => seleccionarMaterial(a.material.codigo)}
              >
                <p className="font-medium text-slate-700">{truncateText(a.material.producto, 56)}</p>
                <p className="text-slate-400">
                  {a.material.codigo} · {a.mensaje}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
