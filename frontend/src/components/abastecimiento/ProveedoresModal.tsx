import { Fragment, useEffect, useMemo, useState } from 'react';
import { Award, ChevronDown, ChevronRight, Clock, Info, Repeat, X } from 'lucide-react';
import { fetchProveedores } from '@/services/abastecimientoService';
import type { ProveedoresProducto } from '@/types/abastecimiento';
import { formatDate, formatNumber } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

/**
 * A quién comprarle.
 *
 * El orden por defecto es por **último precio pagado**, convertido a soles:
 * de las órdenes de 2026, un tercio están en dólares, así que comparar los
 * importes en bruto premiaría al proveedor equivocado.
 *
 * No hay ranking por plazo de entrega porque NetComercial no guarda la fecha
 * real de recepción frente a la comprometida. Antes que inventar un indicador
 * que parezca riguroso y no lo sea, se dice que no existe.
 */

type Orden = 'precio' | 'reciente' | 'volumen' | 'credito';

interface Props {
  codigo: string | null;
  desde: string;
  hasta: string;
  cantidad?: number;
  onCerrar: () => void;
}

export function ProveedoresModal({ codigo, desde, hasta, cantidad, onCerrar }: Props) {
  const [datos, setDatos] = useState<ProveedoresProducto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<Orden>('precio');
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    if (!codigo) {
      setDatos(null);
      setAbierto(null);
      setOrden('precio');
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);

    fetchProveedores(codigo, desde, hasta, cantidad)
      .then((r) => {
        if (!cancelado) setDatos(r);
      })
      .catch((err: unknown) => {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'No fue posible cargar los proveedores.');
          setDatos(null);
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [codigo, desde, hasta, cantidad]);

  const ordenados = useMemo(() => {
    if (!datos) return [];
    const copia = [...datos.proveedores];
    switch (orden) {
      case 'reciente':
        return copia.sort((a, b) => (b.ultima_compra ?? '').localeCompare(a.ultima_compra ?? ''));
      case 'volumen':
        return copia.sort((a, b) => b.unidades - a.unidades);
      case 'credito':
        return copia.sort((a, b) => b.dias_credito - a.dias_credito);
      case 'precio':
      default:
        return copia.sort((a, b) => {
          if (a.ultimo_precio <= 0) return 1;
          if (b.ultimo_precio <= 0) return -1;
          return a.ultimo_precio - b.ultimo_precio;
        });
    }
  }, [datos, orden]);

  if (!codigo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">¿A quién le compro?</h3>
            <p className="text-xs text-slate-400">
              {codigo} · {datos?.descripcion || '…'}
              {cantidad ? ` · necesitas ${formatNumber(cantidad, 0)} ${datos?.unidad ?? ''}` : ''}
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
          {cargando && <LoadingState message="Buscando el histórico de proveedores…" />}
          {error && !cargando && <ErrorState message={error} />}

          {!cargando && datos?.sin_historial && (
            <EmptyState
              title="Sin órdenes de compra en el periodo"
              description={datos.aviso}
            />
          )}

          {!cargando && datos && !datos.sin_historial && (
            <div className="space-y-4">
              {datos.ahorro_maximo !== null && datos.ahorro_maximo !== undefined && datos.ahorro_maximo > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm text-emerald-900">
                    Comprando al más barato en vez de al más caro te ahorras{' '}
                    <strong>S/ {formatNumber(datos.ahorro_maximo, 2)}</strong>
                    {cantidad ? ` en las ${formatNumber(cantidad, 0)} unidades que necesitas` : ''}.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Ordenar por
                </span>
                {(
                  [
                    ['precio', 'Mejor precio'],
                    ['reciente', 'Compra más reciente'],
                    ['volumen', 'Más volumen comprado'],
                    ['credito', 'Más días de crédito'],
                  ] as [Orden, string][]
                ).map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setOrden(valor)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      orden === valor
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-max text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">Proveedor</th>
                      <th className="px-3 py-2 text-right font-semibold" title="Precio de la última orden, en soles">
                        Último precio
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">Rango histórico</th>
                      <th className="px-3 py-2 text-right font-semibold">Sobrecosto</th>
                      {cantidad ? (
                        <th className="px-3 py-2 text-right font-semibold">Costo estimado</th>
                      ) : null}
                      <th className="px-3 py-2 text-right font-semibold">Órdenes</th>
                      <th className="px-3 py-2 text-right font-semibold">Unidades</th>
                      <th className="px-3 py-2 text-right font-semibold">Crédito</th>
                      <th className="px-3 py-2 font-semibold">Última compra</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {ordenados.map((p) => (
                      <Fragment key={p.proveedor_id}>
                        <tr
                          className={`border-t border-slate-100 ${p.es_mejor_precio ? 'bg-emerald-50/50' : ''}`}
                        >
                          <td className="max-w-[240px] px-3 py-2">
                            <p className="truncate font-medium text-slate-700" title={p.proveedor}>
                              {p.proveedor}
                            </p>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {p.es_mejor_precio && (
                                <Etiqueta icono={Award} clases="bg-emerald-100 text-emerald-700">
                                  Mejor precio
                                </Etiqueta>
                              )}
                              {p.es_mas_reciente && (
                                <Etiqueta icono={Clock} clases="bg-sky-100 text-sky-700">
                                  Más reciente
                                </Etiqueta>
                              )}
                              {p.es_mas_usado && (
                                <Etiqueta icono={Repeat} clases="bg-slate-100 text-slate-600">
                                  Más usado
                                </Etiqueta>
                              )}
                              {p.monedas.includes('USD') && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                  cotiza en USD
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">
                            {formatNumber(p.ultimo_precio, 4)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-slate-500">
                            {formatNumber(p.precio_min, 2)} – {formatNumber(p.precio_max, 2)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {p.sobrecosto_vs_mejor > 0 ? (
                              <span className="text-rose-600">
                                +{formatNumber(p.sobrecosto_pct, 1)}%
                              </span>
                            ) : (
                              <span className="text-emerald-600">—</span>
                            )}
                          </td>
                          {cantidad ? (
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {p.costo_estimado !== null ? `S/ ${formatNumber(p.costo_estimado, 2)}` : '—'}
                            </td>
                          ) : null}
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                            {formatNumber(p.ordenes)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                            {formatNumber(p.unidades, 0)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                            {p.dias_credito > 0 ? `${p.dias_credito} d` : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                            {formatDate(p.ultima_compra)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setAbierto(abierto === p.proveedor_id ? null : p.proveedor_id)
                              }
                              className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                            >
                              {abierto === p.proveedor_id ? (
                                <ChevronDown size={13} />
                              ) : (
                                <ChevronRight size={13} />
                              )}
                              historial
                            </button>
                          </td>
                        </tr>
                        {abierto === p.proveedor_id && (
                          <tr className="bg-slate-50">
                            <td colSpan={cantidad ? 10 : 9} className="px-3 py-2">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-[10px] uppercase text-slate-400">
                                    <th className="py-1 pr-4">Orden</th>
                                    <th className="py-1 pr-4">Fecha</th>
                                    <th className="py-1 pr-4 text-right">Cantidad</th>
                                    <th className="py-1 pr-4 text-right">Precio original</th>
                                    <th className="py-1 pr-4">Moneda</th>
                                    <th className="py-1 pr-4 text-right">Precio en soles</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.historial.slice(0, 15).map((h) => (
                                    <tr key={h.documento} className="border-t border-slate-200/70">
                                      <td className="py-1 pr-4 tabular-nums text-slate-700">
                                        {h.documento}
                                      </td>
                                      <td className="py-1 pr-4 text-slate-500">
                                        {formatDate(h.fecha)}
                                      </td>
                                      <td className="py-1 pr-4 text-right tabular-nums text-slate-600">
                                        {formatNumber(h.cantidad, 2)}
                                      </td>
                                      <td className="py-1 pr-4 text-right tabular-nums text-slate-600">
                                        {formatNumber(h.precio_original, 4)}
                                      </td>
                                      <td className="py-1 pr-4 text-slate-500">{h.moneda}</td>
                                      <td className="py-1 pr-4 text-right tabular-nums text-slate-700">
                                        {formatNumber(h.precio_soles, 4)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-900">
                <Info size={15} className="mt-0.5 shrink-0" />
                <p>{datos.aviso}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Etiqueta({
  icono: Icono,
  clases,
  children,
}: {
  icono: typeof Award;
  clases: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${clases}`}
    >
      <Icono size={10} />
      {children}
    </span>
  );
}
