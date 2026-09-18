import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { usePanoramaContext } from '@/context/PanoramaContext';
import { fetchConsolidadoDetalle } from '@/services/requerimientosService';
import type { ConsolidadoProductoRecord } from '@/types/requerimiento';
import { formatCompactCurrency, formatDate, formatNumber } from '@/utils/formatters';
import { Badge } from '@/components/common/Badge';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { PanoramaNivelBadge, PanoramaRecomendacionBadge } from './PanoramaNivelBadge';

/**
 * "PLAN DE ACCIÓN" (Nivel 2): qué comprar, cuánto, para cuánto tiempo,
 * cuántas veces se ha solicitado, en cuántos REQ aparece, qué OC anteriores
 * existen, último precio, proveedor, y si corresponde abastecer / esperar /
 * planificar según la clasificación del material.
 */
export function PanoramaDetalleModal() {
  const { codigoSeleccionado, cerrarDetalle, catalogo } = usePanoramaContext();
  const [detalle, setDetalle] = useState<ConsolidadoProductoRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const material = useMemo(() => catalogo.find((m) => m.codigo === codigoSeleccionado) ?? null, [catalogo, codigoSeleccionado]);

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
        if (!record) setError('No se encontró el historial completo de este material.');
      })
      .catch(() => {
        if (!cancelled) setError('No fue posible cargar el historial completo del material.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [codigoSeleccionado]);

  if (!codigoSeleccionado || !material) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{material.producto}</h3>
            <p className="text-xs text-slate-400">{material.codigo}</p>
          </div>
          <button type="button" onClick={cerrarDetalle} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <PanoramaNivelBadge nivel={material.nivel} />
            <PanoramaRecomendacionBadge recomendacion={material.recomendacion} />
            {material.familia && <Badge>{material.familia}</Badge>}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Plan de acción</h4>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Qué comprar" value={material.producto} />
              <Stat
                label="Cuánto comprar"
                value={
                  material.cantidadRecomendada !== null
                    ? `${formatNumber(material.cantidadRecomendada, 1)} ${material.unidadMedida ?? ''}`
                    : material.nivel === 'estacional'
                      ? 'Según temporada'
                      : 'Bajo requerimiento'
                }
              />
              <Stat
                label="Para cuánto tiempo cubriría"
                value={material.coberturaObjetivoMeses !== null ? `${formatNumber(material.coberturaObjetivoMeses, 1)} meses` : 'No aplica (baja/estacional)'}
              />
              <Stat label="Veces solicitado" value={formatNumber(material.vecesSolicitado)} />
              <Stat label="En cuántos REQ aparece" value={formatNumber(material.reqNumeros.length)} />
              <Stat label="REQ pendientes" value={formatNumber(material.reqPendientes)} />
              <Stat label="Última OC anterior" value={material.ultimaOC ?? 'Dato no disponible'} />
              <Stat label="Último precio" value={material.precioReferencia !== null ? formatCompactCurrency(material.precioReferencia, material.monedaReferencia === 'USD' ? 'USD' : 'PEN') : 'Dato no disponible'} />
              <Stat label="Proveedor utilizado" value={material.proveedorPrincipal ?? 'Dato no disponible'} />
              <Stat label="Primera solicitud" value={formatDate(material.primeraSolicitud)} />
              <Stat label="Última solicitud" value={formatDate(material.ultimaSolicitud)} />
              <Stat label="Frecuencia" value={material.frecuenciaPromedioDias !== null ? `Cada ${formatNumber(material.frecuenciaPromedioDias, 0)} días` : 'Dato no disponible'} />
            </dl>
            {material.nivel === 'estacional' && material.mesMayorConsumo && (
              <p className="mt-3 rounded-lg bg-sky-50 p-3 text-xs text-sky-800">
                📅 Mayor demanda en <strong>{material.mesMayorConsumo}</strong> (consumo {formatNumber(material.variacionConsumoPct ?? 0, 0)}% por
                encima del promedio mensual) — planificar la compra antes de esa temporada.
              </p>
            )}
            {material.nivel === 'baja' && (
              <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                🟢 Baja rotación: no conviene mantener stock permanente. Comprar únicamente cuando exista un nuevo requerimiento, o consolidar si se
                acumulan varios REQ del mismo material.
              </p>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">N° de requerimientos relacionados</h4>
            <div className="flex flex-wrap gap-1.5">
              {material.reqNumeros.slice(0, 30).map((req) => (
                <Badge key={req}>{req}</Badge>
              ))}
              {material.reqNumeros.length > 30 && <span className="text-xs text-slate-400">+{material.reqNumeros.length - 30} más</span>}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Historial completo de solicitudes</h4>
            {loading && <LoadingState message="Cargando historial completo..." />}
            {error && !loading && <ErrorState message={error} />}
            {!loading && detalle && (
              <div className="max-h-64 overflow-auto">
                <table className="w-full min-w-max text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-xs uppercase text-slate-400">
                      <th className="py-1 pr-4">Fecha</th>
                      <th className="py-1 pr-4">N° Requerimiento</th>
                      <th className="py-1 pr-4">Cantidad</th>
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
                        <td className="py-1.5 pr-4">{item.estado_normalizado ? <Badge>{item.estado_normalizado}</Badge> : '—'}</td>
                        <td className="py-1.5 pr-4 text-slate-600">{item.tiene_oc && item.nro_oc && item.nro_oc !== 'nan' ? item.nro_oc : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
