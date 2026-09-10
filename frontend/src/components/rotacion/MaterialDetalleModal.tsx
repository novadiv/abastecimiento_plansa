import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useRotacionContext } from '@/context/RotacionContext';
import { fetchConsolidadoDetalle } from '@/services/requerimientosService';
import type { ConsolidadoProductoRecord } from '@/types/requerimiento';
import { buildProductoRotacion } from '@/utils/rotacionCalculations';
import { formatCompactCurrency, formatDate, formatNumber } from '@/utils/formatters';
import { Badge } from '@/components/common/Badge';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { NivelBadge, EstacionalBadge } from './NivelBadge';

export function MaterialDetalleModal() {
  const { codigoSeleccionado, cerrarDetalle, config } = useRotacionContext();
  const [detalle, setDetalle] = useState<ConsolidadoProductoRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!codigoSeleccionado) {
      setDetalle(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchConsolidadoDetalle(codigoSeleccionado)
      .then((record) => {
        if (cancelled) return;
        setDetalle(record);
        if (!record) setError('No se encontró el detalle de este material.');
      })
      .catch(() => {
        if (!cancelled) setError('No fue posible cargar el detalle del material.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [codigoSeleccionado]);

  if (!codigoSeleccionado) return null;

  const rotacion = detalle ? buildProductoRotacion(detalle, config) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{detalle?.producto ?? 'Detalle del material'}</h3>
            <p className="text-xs text-slate-400">{codigoSeleccionado}</p>
          </div>
          <button type="button" onClick={cerrarDetalle} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {loading && <LoadingState message="Cargando historial del material..." />}
          {error && !loading && <ErrorState message={error} />}

          {!loading && rotacion && detalle && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <NivelBadge nivel={rotacion.nivel} />
                {rotacion.esEstacional && <EstacionalBadge />}
                {rotacion.familia && <Badge>{rotacion.familia}</Badge>}
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${rotacion.estado === 'activo' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {rotacion.estado === 'activo' ? 'Activo' : 'Inactivo'}
                </span>
                {rotacion.diasSinMovimiento !== null && rotacion.diasSinMovimiento >= config.diasSinMovimiento && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                    ⚠️ {formatNumber(rotacion.diasSinMovimiento)} días sin movimiento
                  </span>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Movimientos" value={formatNumber(rotacion.movimientos)} />
                <Stat label="Cantidad total" value={formatNumber(rotacion.cantidadTotal, 1)} />
                <Stat label="Stock actual" value={rotacion.stockActual !== null ? formatNumber(rotacion.stockActual, 1) : 'Dato no disponible'} />
                <Stat label="Frecuencia" value={rotacion.frecuenciaPromedioDias !== null ? `Cada ${formatNumber(rotacion.frecuenciaPromedioDias, 0)} días` : 'Dato no disponible'} />
                <Stat
                  label="Valor (aprox.)"
                  value={rotacion.valorEstimado !== null ? formatCompactCurrency(rotacion.valorEstimado, rotacion.monedaReferencia === 'USD' ? 'USD' : 'PEN') : 'Dato no disponible'}
                />
                <Stat label="Primer movimiento" value={formatDate(rotacion.primerMovimiento)} />
                <Stat label="Último movimiento" value={formatDate(rotacion.ultimoMovimiento)} />
                <Stat label="Proveedor principal" value={rotacion.proveedorPrincipal ?? 'Dato no disponible'} />
                <Stat label="Área que más lo solicita" value={rotacion.areaPrincipal ?? 'Dato no disponible'} />
                <Stat label="Mes de mayor consumo" value={rotacion.mesMayorConsumo ?? 'Dato insuficiente'} />
                <Stat
                  label="Variación vs. promedio mensual"
                  value={rotacion.variacionConsumoPct !== null ? `+${formatNumber(rotacion.variacionConsumoPct, 0)}%` : 'Dato insuficiente'}
                />
              </dl>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Proveedores históricos</h4>
                {detalle.proveedores_historicos.length === 0 ? (
                  <p className="text-sm text-slate-400">Dato no disponible</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-slate-400">
                          <th className="py-1 pr-4">Proveedor</th>
                          <th className="py-1 pr-4">N° compras</th>
                          <th className="py-1 pr-4">Último precio</th>
                          <th className="py-1 pr-4">Última fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.proveedores_historicos.map((p) => (
                          <tr key={p.proveedor} className="border-t border-slate-50">
                            <td className="py-1.5 pr-4 text-slate-700">{p.proveedor}</td>
                            <td className="py-1.5 pr-4 text-slate-600">{formatNumber(p.n_compras)}</td>
                            <td className="py-1.5 pr-4 text-slate-600">
                              {p.ultimo_precio !== null ? `${p.moneda ?? ''} ${formatNumber(p.ultimo_precio, 2)}` : 'Dato no disponible'}
                            </td>
                            <td className="py-1.5 pr-4 text-slate-600">{formatDate(p.ultima_fecha)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Historial de solicitudes ({detalle.items.length})
                </h4>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full min-w-max text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-xs uppercase text-slate-400">
                        <th className="py-1 pr-4">Fecha</th>
                        <th className="py-1 pr-4">N° Requerimiento</th>
                        <th className="py-1 pr-4">Cantidad</th>
                        <th className="py-1 pr-4">Área</th>
                        <th className="py-1 pr-4">Solicitante</th>
                        <th className="py-1 pr-4">Estado</th>
                        <th className="py-1 pr-4">N° OC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.items.map((item) => (
                        <tr key={item.id_requerimiento} className="border-t border-slate-50">
                          <td className="py-1.5 pr-4 text-slate-600">{formatDate(item.fecha)}</td>
                          <td className="py-1.5 pr-4 text-slate-700">{item.req_nro}</td>
                          <td className="py-1.5 pr-4 text-slate-600">{formatNumber(item.cantidad ?? undefined, 1)}</td>
                          <td className="py-1.5 pr-4 text-slate-600">{item.area_origen ?? '—'}</td>
                          <td className="py-1.5 pr-4 text-slate-600">{item.solicita ?? '—'}</td>
                          <td className="py-1.5 pr-4">{item.estado_normalizado ? <Badge>{item.estado_normalizado}</Badge> : '—'}</td>
                          <td className="py-1.5 pr-4 text-slate-600">{item.tiene_oc && item.nro_oc && item.nro_oc !== 'nan' ? item.nro_oc : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-700">{value}</dd>
    </div>
  );
}
