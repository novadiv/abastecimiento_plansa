import { useEffect, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { X } from 'lucide-react';
import { fetchHistorialProducto } from '@/services/abastecimientoService';
import type { HistorialProducto } from '@/types/abastecimiento';
import { formatDate, formatNumber } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';

/**
 * Las tres series están en la MISMA unidad (unidades del producto), así que
 * comparten un único eje. No se mezcla aquí el importe en soles: sería un
 * segundo eje con otra escala, y dos escalas en un mismo gráfico hacen que
 * cualquier cruce entre líneas parezca significar algo cuando no significa
 * nada. El importe va en las cifras de arriba y en la tabla de compras.
 *
 * Colores validados contra el fondo blanco de la tarjeta: separación
 * suficiente también con daltonismo. El ámbar queda por debajo de 3:1 de
 * contraste, por eso el gráfico lleva siempre leyenda y la tabla de compras
 * debajo repite los mismos datos en texto.
 */
const COLOR_COMPRAS = '#3b64f5';
const COLOR_CONSUMO = '#0ea5a3';
const COLOR_DEMANDA = '#f59e0b';

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'set', 'oct', 'nov', 'dic',
];

function etiquetaMes(clave: string): string {
  const [anio, mes] = clave.split('-');
  const indice = Number(mes) - 1;
  return `${MESES_CORTOS[indice] ?? mes} ${anio.slice(2)}`;
}

interface Props {
  codigo: string | null;
  desde: string;
  hasta: string;
  onCerrar: () => void;
}

export function HistorialProductoModal({ codigo, desde, hasta, onCerrar }: Props) {
  const [historial, setHistorial] = useState<HistorialProducto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!codigo) {
      setHistorial(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);

    fetchHistorialProducto(codigo, desde, hasta)
      .then((resultado) => {
        if (!cancelado) setHistorial(resultado);
      })
      .catch((err: unknown) => {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'No fue posible cargar el historial.');
          setHistorial(null);
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [codigo, desde, hasta]);

  if (!codigo) return null;

  const datos =
    historial?.serie_mensual.map((punto) => ({
      ...punto,
      etiqueta: etiquetaMes(punto.mes),
    })) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              {historial?.descripcion || 'Historial del producto'}
            </h3>
            <p className="text-xs text-slate-400">
              {codigo}
              {historial?.unidad ? ` · ${historial.unidad}` : ''} · del {formatDate(desde)} al{' '}
              {formatDate(hasta)}
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
          {cargando && <LoadingState message="Cargando el historial del producto…" />}
          {error && !cargando && <ErrorState message={error} />}

          {!cargando && historial && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Cifra etiqueta="Comprado" valor={formatNumber(historial.totales.comprado, 0)} />
                <Cifra etiqueta="Consumido" valor={formatNumber(historial.totales.consumido, 0)} />
                <Cifra etiqueta="Solicitado" valor={formatNumber(historial.totales.solicitado, 0)} />
                <Cifra etiqueta="Stock actual" valor={formatNumber(historial.stock_actual, 0)} />
                <Cifra
                  etiqueta="Costo promedio"
                  valor={`S/ ${formatNumber(historial.totales.costo_promedio, 2)}`}
                />
              </div>

              {datos.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  No hay movimientos de este producto en el periodo seleccionado.
                </p>
              ) : (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Evolución mensual
                  </h4>
                  <p className="mb-3 text-[11px] text-slate-400">
                    Las barras son las compras que entraron; las líneas, lo que salió de almacén y lo
                    que pidieron las áreas. Todo en {historial.unidad || 'unidades'}.
                  </p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={datos} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="etiqueta"
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          tickLine={false}
                          axisLine={false}
                          width={64}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                          formatter={(valor: number, nombre: string) => [
                            formatNumber(valor, 0),
                            nombre,
                          ]}
                          contentStyle={{
                            borderRadius: 8,
                            borderColor: '#e2e8f0',
                            fontSize: 12,
                          }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                          iconType="circle"
                          iconSize={8}
                        />
                        <Bar
                          dataKey="compras"
                          name="Compras (ingresos)"
                          fill={COLOR_COMPRAS}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={28}
                        />
                        <Line
                          type="monotone"
                          dataKey="consumo"
                          name="Consumo de almacén"
                          stroke={COLOR_CONSUMO}
                          strokeWidth={2}
                          dot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                          activeDot={{ r: 6 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="requerimientos"
                          name="Demanda solicitada"
                          stroke={COLOR_DEMANDA}
                          strokeWidth={2}
                          strokeDasharray="5 4"
                          dot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                          activeDot={{ r: 6 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Compras del periodo ({historial.compras.length})
                </h4>
                {historial.compras.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No se registró ninguna compra de este producto en el periodo.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-max text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-2 font-semibold">Fecha</th>
                          <th className="px-3 py-2 font-semibold">Documento</th>
                          <th className="px-3 py-2 text-right font-semibold">Cantidad</th>
                          <th className="px-3 py-2 text-right font-semibold">Costo unit. (S/)</th>
                          <th className="px-3 py-2 text-right font-semibold">Importe (S/)</th>
                          <th className="px-3 py-2 font-semibold">Moneda</th>
                          <th className="px-3 py-2 font-semibold">Almacén</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historial.compras.map((compra) => (
                          <tr key={compra.documento} className="border-t border-slate-100">
                            <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">
                              {formatDate(compra.fecha)}
                            </td>
                            <td className="px-3 py-1.5 tabular-nums text-slate-700">
                              {compra.documento}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                              {formatNumber(compra.cantidad, 2)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                              {formatNumber(compra.costo_unitario, 4)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                              {formatNumber(compra.importe, 2)}
                            </td>
                            <td className="px-3 py-1.5 text-slate-500">{compra.moneda_compra}</td>
                            <td className="px-3 py-1.5 text-slate-500">{compra.almacen || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{etiqueta}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-700">{valor}</p>
    </div>
  );
}
