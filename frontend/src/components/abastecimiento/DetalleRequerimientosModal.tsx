import { useEffect, useMemo, useState } from 'react';
import { Info, Search, X } from 'lucide-react';
import { fetchDetalleProducto } from '@/services/abastecimientoService';
import type { DetalleProducto, FiltrosAbastecimiento } from '@/types/abastecimiento';
import { formatDate, formatNumber } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';

interface Props {
  codigo: string | null;
  filtros: FiltrosAbastecimiento;
  onCerrar: () => void;
}

/**
 * Desglose de un renglón consolidado: todos los requerimientos que suman esa
 * cantidad, para poder responder "¿de dónde salen estas 300 unidades?".
 *
 * Sobre la glosa: en esta base los campos de glosa están vacíos — ni un solo
 * requerimiento de 2026 tiene texto en la glosa de cabecera ni en la de
 * detalle. El único texto libre que el sistema sí guarda es `referencia`, y
 * aparece en torno al 9 % de las líneas. Por eso la tabla muestra además todo
 * el contexto que sí existe (área, solicitante, centro de costo, orden de
 * trabajo), que es lo que permite rastrear el origen de cada pedido.
 */
export function DetalleRequerimientosModal({ codigo, filtros, onCerrar }: Props) {
  const [detalle, setDetalle] = useState<DetalleProducto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    if (!codigo) {
      setDetalle(null);
      setBusqueda('');
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);

    fetchDetalleProducto(codigo, filtros)
      .then((resultado) => {
        if (!cancelado) setDetalle(resultado);
      })
      .catch((err: unknown) => {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'No fue posible cargar el detalle.');
          setDetalle(null);
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [codigo, filtros]);

  const visibles = useMemo(() => {
    if (!detalle) return [];
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return detalle.requerimientos;
    return detalle.requerimientos.filter(
      (r) =>
        r.documento.toLowerCase().includes(texto) ||
        r.usuario.toLowerCase().includes(texto) ||
        r.area.toLowerCase().includes(texto) ||
        r.referencia.toLowerCase().includes(texto) ||
        r.orden_trabajo.toLowerCase().includes(texto),
    );
  }, [detalle, busqueda]);

  if (!codigo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              {detalle?.descripcion || 'Detalle del requerimiento'}
            </h3>
            <p className="text-xs text-slate-400">
              {codigo}
              {detalle?.unidad ? ` · ${detalle.unidad}` : ''} · del{' '}
              {formatDate(filtros.desde)} al {formatDate(filtros.hasta)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {cargando && <LoadingState message="Buscando los requerimientos de este producto…" />}
          {error && !cargando && <ErrorState message={error} />}

          {!cargando && detalle && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Cifra etiqueta="Total solicitado" valor={formatNumber(detalle.total_solicitado, 2)} />
                <Cifra etiqueta="Ya atendido" valor={formatNumber(detalle.total_atendido, 2)} />
                <Cifra
                  etiqueta="Pendiente"
                  valor={formatNumber(detalle.total_pendiente, 2)}
                  destacado
                />
                <Cifra
                  etiqueta="Requerimientos"
                  valor={formatNumber(detalle.requerimientos.length)}
                />
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-900">
                <Info size={15} className="mt-0.5 shrink-0" />
                <p>
                  En esta base de datos <strong>los campos de glosa están vacíos</strong> (ninguno de
                  los 36.209 requerimientos de 2026 tiene glosa de cabecera ni de detalle). El único
                  texto libre que el sistema guarda es <strong>referencia</strong>, presente en{' '}
                  {formatNumber(detalle.con_referencia)} de {formatNumber(detalle.requerimientos.length)}{' '}
                  líneas de este producto. Se muestran además el área, el solicitante, el centro de
                  costo y la orden de trabajo, que son los datos que sí permiten rastrear el origen.
                </p>
              </div>

              <div className="relative max-w-sm">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  className="input pl-8"
                  placeholder="Buscar por documento, usuario, área u OT"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-max text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">Documento</th>
                      <th className="px-3 py-2 font-semibold">Fecha</th>
                      <th className="px-3 py-2 font-semibold">Solicitante</th>
                      <th className="px-3 py-2 font-semibold">Área</th>
                      <th className="px-3 py-2 font-semibold">C. costo</th>
                      <th className="px-3 py-2 font-semibold">Almacén</th>
                      <th className="px-3 py-2 font-semibold">OT</th>
                      <th className="px-3 py-2 text-right font-semibold">Cantidad</th>
                      <th className="px-3 py-2 text-right font-semibold">Atendido</th>
                      <th className="px-3 py-2 text-right font-semibold">Pendiente</th>
                      <th className="px-3 py-2 font-semibold">Referencia / glosa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((r) => (
                      <tr
                        key={`${r.documento}-${r.item}`}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700 tabular-nums">
                          {r.documento}
                          <span className="ml-1 text-[10px] text-slate-400">·{r.item}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {formatDate(r.fecha)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600" title={r.usuario_nombre}>
                          {r.usuario}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.area}</td>
                        <td className="px-3 py-2 text-slate-500">{r.centro_costo || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{r.almacen || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-500">
                          {r.orden_trabajo || '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">
                          {formatNumber(r.cantidad, 2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {formatNumber(r.atendido, 2)}
                          {r.atendido_aproximado && (
                            <span
                              className="ml-0.5 text-amber-500"
                              title="El documento repite este producto en varias líneas; lo despachado se reparte a prorrata"
                            >
                              ≈
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {formatNumber(r.pendiente, 2)}
                        </td>
                        <td className="max-w-[240px] px-3 py-2 text-slate-600">
                          {r.referencia ? (
                            <span title={r.referencia}>{r.referencia}</span>
                          ) : (
                            <span className="text-slate-300">sin texto</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {visibles.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  Ningún requerimiento coincide con la búsqueda.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{etiqueta}</p>
      <p className={`mt-0.5 text-lg font-semibold ${destacado ? 'text-brand-700' : 'text-slate-700'}`}>
        {valor}
      </p>
    </div>
  );
}
