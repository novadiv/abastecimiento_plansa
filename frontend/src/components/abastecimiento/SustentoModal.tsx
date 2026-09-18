import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Check, ChevronDown, ChevronRight, Info, Truck, X } from 'lucide-react';
import { fetchSustento } from '@/services/abastecimientoService';
import type { BaseConsumo, MesSustento, SustentoProducto } from '@/types/abastecimiento';
import { formatDate, formatNumber } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';

/**
 * La pantalla que demuestra el número.
 *
 * Nace de una pregunta concreta del comprador: "¿cómo le demuestro a mi jefe
 * que estas 10 unidades al mes son reales y no inventadas?". Por eso no
 * resume: enseña la división completa, el mes a mes, la dispersión y los
 * documentos con su número, para que cualquiera pueda ir al ERP y
 * comprobarlos uno por uno.
 */

const COLOR_BARRA = '#3b64f5';
const COLOR_BARRA_PARCIAL = '#c7d2fe';

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'set', 'oct', 'nov', 'dic',
];

function etiquetaMes(clave: string): string {
  const [anio, mes] = clave.split('-');
  return `${MESES_CORTOS[Number(mes) - 1] ?? mes} ${anio.slice(2)}`;
}

const ESTABILIDAD: Record<string, { texto: string; clases: string; ayuda: string }> = {
  estable: {
    texto: 'Consumo estable',
    clases: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    ayuda: 'Varía menos del 25% entre meses: el promedio es un buen predictor.',
  },
  variable: {
    texto: 'Consumo variable',
    clases: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    ayuda: 'Varía entre el 25% y el 50%: conviene un margen sobre el promedio.',
  },
  erratico: {
    texto: 'Consumo errático',
    clases: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
    ayuda: 'Varía más del 50% entre meses: el promedio solo no basta para decidir.',
  },
  'sin-datos': {
    texto: 'Sin datos suficientes',
    clases: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    ayuda: 'No hay meses completos suficientes para medir la dispersión.',
  },
};

interface Props {
  codigo: string | null;
  desde: string;
  hasta: string;
  base: BaseConsumo;
  meses: number;
  onCerrar: () => void;
}

export function SustentoModal({ codigo, desde, hasta, base, meses, onCerrar }: Props) {
  const [datos, setDatos] = useState<SustentoProducto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mesAbierto, setMesAbierto] = useState<string | null>(null);

  useEffect(() => {
    if (!codigo) {
      setDatos(null);
      setMesAbierto(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);

    fetchSustento(codigo, desde, hasta, base, meses)
      .then((r) => {
        if (!cancelado) setDatos(r);
      })
      .catch((err: unknown) => {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'No fue posible cargar el sustento.');
          setDatos(null);
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [codigo, desde, hasta, base, meses]);

  if (!codigo) return null;

  const grafico =
    datos?.serie_mensual.map((m) => ({
      etiqueta: etiquetaMes(m.mes),
      valor: m[datos.base.id],
      completo: m.completo,
    })) ?? [];

  const promedio = datos?.estadistica.promedio ?? null;
  const estabilidad = ESTABILIDAD[datos?.estadistica.estabilidad ?? 'sin-datos'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              ¿De dónde sale este número?
            </h3>
            <p className="text-xs text-slate-400">
              {codigo} · {datos?.descripcion || '…'}
              {datos?.unidad ? ` · ${datos.unidad}` : ''}
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
          {cargando && <LoadingState message="Reuniendo la evidencia en el ERP…" />}
          {error && !cargando && <ErrorState message={error} />}

          {!cargando && datos && (
            <div className="space-y-6">
              {/* ── El cálculo, paso a paso ────────────────────────── */}
              <section className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-800">
                  El cálculo
                </h4>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Paso
                    numero="1"
                    titulo="Lo que se movió en el periodo"
                    valor={formatNumber(datos.calculo.total_periodo, 2)}
                    detalle={`${datos.base.etiqueta}, del ${formatDate(datos.periodo.desde)} al ${formatDate(datos.periodo.hasta)}`}
                  />
                  <Paso
                    numero="2"
                    titulo="Dividido entre los meses"
                    valor={formatNumber(datos.calculo.meses_periodo, 2)}
                    detalle={`${datos.periodo.dias} días ÷ 30,44 días por mes`}
                  />
                  <Paso
                    numero="3"
                    titulo="Ritmo mensual"
                    valor={formatNumber(datos.calculo.ritmo_mensual, 2)}
                    detalle={`${formatNumber(datos.calculo.total_periodo, 2)} ÷ ${formatNumber(datos.calculo.meses_periodo, 2)}`}
                    destacado
                  />
                </div>

                <div className="mt-4 rounded-lg bg-white p-3 ring-1 ring-brand-100">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Y de ahí, cuánto comprar
                  </p>
                  <p className="font-mono text-sm leading-relaxed text-slate-700">
                    {datos.calculo.formula}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                    <Linea etiqueta="Ritmo × cobertura" valor={formatNumber(datos.calculo.necesidad, 2)} />
                    <Linea etiqueta="− Stock actual" valor={formatNumber(datos.calculo.stock_actual, 2)} />
                    <Linea etiqueta="− Ya en camino" valor={formatNumber(datos.calculo.en_camino, 2)} />
                    <Linea
                      etiqueta="= Comprar"
                      valor={formatNumber(datos.calculo.sugerido_comprar, 2)}
                      destacado
                    />
                  </dl>
                </div>
              </section>

              {/* ── Pedido y sin llegar ────────────────────────────── */}
              {datos.ordenes_pendientes.length > 0 && (
                <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <h4 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
                    <Truck size={14} /> Ya pedido al proveedor y sin llegar
                  </h4>
                  <p className="mb-3 text-xs text-amber-900">
                    Estas {formatNumber(datos.total_en_camino, 2)} unidades ya están ordenadas. Se
                    descuentan de lo que hay que comprar para no pedir dos veces lo mismo.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-amber-700">
                          <th className="py-1 pr-4">Orden</th>
                          <th className="py-1 pr-4">Fecha</th>
                          <th className="py-1 pr-4">Proveedor</th>
                          <th className="py-1 pr-4 text-right">Pedido</th>
                          <th className="py-1 pr-4 text-right">Recibido</th>
                          <th className="py-1 pr-4 text-right">Falta</th>
                          <th className="py-1 pr-4">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.ordenes_pendientes.map((o) => (
                          <tr key={o.documento} className="border-t border-amber-100">
                            <td className="py-1.5 pr-4 font-medium tabular-nums text-slate-700">
                              {o.documento}
                            </td>
                            <td className="whitespace-nowrap py-1.5 pr-4 text-slate-600">
                              {formatDate(o.fecha)}
                            </td>
                            <td className="max-w-[200px] truncate py-1.5 pr-4 text-slate-600" title={o.proveedor}>
                              {o.proveedor || '—'}
                            </td>
                            <td className="py-1.5 pr-4 text-right tabular-nums text-slate-700">
                              {formatNumber(o.cantidad, 2)}
                            </td>
                            <td className="py-1.5 pr-4 text-right tabular-nums text-slate-500">
                              {formatNumber(o.recibido, 2)}
                            </td>
                            <td className="py-1.5 pr-4 text-right tabular-nums font-semibold text-amber-800">
                              {formatNumber(o.pendiente, 2)}
                            </td>
                            <td className="py-1.5 pr-4 text-slate-600">{o.estado_texto}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* ── Mes a mes ──────────────────────────────────────── */}
              <section>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Mes a mes — {datos.base.etiqueta}
                  </h4>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${estabilidad.clases}`}
                    title={estabilidad.ayuda}
                  >
                    {estabilidad.texto}
                    {datos.estadistica.variabilidad_pct !== null &&
                      ` · varía ${formatNumber(datos.estadistica.variabilidad_pct, 0)}%`}
                  </span>
                </div>
                <p className="mb-3 text-[11px] text-slate-400">
                  La línea punteada es el promedio de los meses completos. Las barras claras son
                  meses que el filtro corta por la mitad, y por eso no cuentan para el promedio.
                </p>

                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={grafico} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
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
                        width={56}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                        formatter={(v: number) => [formatNumber(v, 2), datos.base.etiqueta]}
                        contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                      />
                      {promedio !== null && (
                        <ReferenceLine
                          y={promedio}
                          stroke="#0f172a"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          label={{
                            value: `promedio ${formatNumber(promedio, 1)}`,
                            position: 'right',
                            fontSize: 10,
                            fill: '#0f172a',
                          }}
                        />
                      )}
                      <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={34}>
                        {grafico.map((p) => (
                          <Cell
                            key={p.etiqueta}
                            fill={p.completo ? COLOR_BARRA : COLOR_BARRA_PARCIAL}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Cifra etiqueta="Mes más bajo" valor={formatNumber(datos.estadistica.minimo, 2)} />
                  <Cifra etiqueta="Promedio mensual" valor={formatNumber(datos.estadistica.promedio, 2)} />
                  <Cifra etiqueta="Mes más alto" valor={formatNumber(datos.estadistica.maximo, 2)} />
                  <Cifra
                    etiqueta="Meses completos"
                    valor={formatNumber(datos.estadistica.meses_completos)}
                  />
                </div>

                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-max text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 font-semibold">Mes</th>
                        <th className="px-3 py-2 text-right font-semibold">Compras</th>
                        <th className="px-3 py-2 text-right font-semibold">Consumo</th>
                        <th className="px-3 py-2 text-right font-semibold">Solicitado</th>
                        <th className="px-3 py-2 text-right font-semibold">Ordenado</th>
                        <th className="px-3 py-2 text-right font-semibold">Documentos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.serie_mensual.map((m) => (
                        <FilaMes
                          key={m.mes}
                          mes={m}
                          abierto={mesAbierto === m.mes}
                          onAlternar={() => setMesAbierto(mesAbierto === m.mes ? null : m.mes)}
                        />
                      ))}
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                        <td className="px-3 py-2 text-slate-700">Total</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {formatNumber(datos.totales.compras, 2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {formatNumber(datos.totales.consumo, 2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {formatNumber(datos.totales.requerimientos, 2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {formatNumber(datos.totales.ordenes, 2)}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ── Comparación de bases ───────────────────────────── */}
              <section>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  El número cambia según la fuente que se use
                </h4>
                <p className="mb-3 text-[11px] text-slate-400">
                  Las cuatro son ciertas: miden hechos distintos. Lo comprado no es lo consumido, y
                  lo consumido no es lo que pidieron las áreas.
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-max text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 font-semibold">Fuente</th>
                        <th className="px-3 py-2 font-semibold">Documento en el ERP</th>
                        <th className="px-3 py-2 text-right font-semibold">Total periodo</th>
                        <th className="px-3 py-2 text-right font-semibold">Ritmo/mes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.comparacion_bases.map((c) => (
                        <tr
                          key={c.base}
                          className={`border-t border-slate-100 ${c.seleccionada ? 'bg-brand-50/60' : ''}`}
                        >
                          <td className="px-3 py-2 text-slate-700">
                            <span className="flex items-center gap-1.5">
                              {c.seleccionada && <Check size={13} className="text-brand-600" />}
                              {c.etiqueta}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500">{c.fuente}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                            {formatNumber(c.total, 2)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums ${c.seleccionada ? 'font-semibold text-brand-700' : 'text-slate-600'}`}
                          >
                            {formatNumber(c.ritmo_mensual, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ── Cómo comprobarlo ───────────────────────────────── */}
              <section className="flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-900">
                <Info size={15} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Cómo comprobarlo en NetComercial</p>
                  <ol className="mt-1 list-inside list-decimal space-y-0.5">
                    <li>
                      Saca el reporte de <strong>{datos.base.fuente}</strong> del producto{' '}
                      {datos.codigo}, del {formatDate(datos.periodo.desde)} al{' '}
                      {formatDate(datos.periodo.hasta)}.
                    </li>
                    <li>
                      Suma la columna de cantidad: debe dar{' '}
                      <strong>{formatNumber(datos.calculo.total_periodo, 2)}</strong>.
                    </li>
                    <li>
                      Divide entre <strong>{formatNumber(datos.calculo.meses_periodo, 2)}</strong>{' '}
                      meses: sale <strong>{formatNumber(datos.calculo.ritmo_mensual, 2)}</strong> al mes.
                    </li>
                  </ol>
                  <p className="mt-1.5">
                    Cada mes de la tabla se abre y muestra los documentos con su número, para
                    contrastarlos uno por uno.
                  </p>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilaMes({
  mes,
  abierto,
  onAlternar,
}: {
  mes: MesSustento;
  abierto: boolean;
  onAlternar: () => void;
}) {
  return (
    <>
      <tr className={`border-t border-slate-100 ${mes.completo ? '' : 'bg-slate-50/60'}`}>
        <td className="px-3 py-2 text-slate-700">
          {etiquetaMes(mes.mes)}
          {!mes.completo && (
            <span className="ml-1.5 text-[10px] text-slate-400" title="El filtro corta este mes">
              (parcial)
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
          {formatNumber(mes.compras, 2)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
          {formatNumber(mes.consumo, 2)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
          {formatNumber(mes.requerimientos, 2)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
          {formatNumber(mes.ordenes, 2)}
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={onAlternar}
            className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
          >
            {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {mes.documentos.length}
          </button>
        </td>
      </tr>
      {abierto && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="px-3 py-2">
            {mes.documentos.length === 0 ? (
              <p className="text-xs text-slate-400">Sin movimientos este mes.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-slate-400">
                    <th className="py-1 pr-4">Tipo</th>
                    <th className="py-1 pr-4">Documento</th>
                    <th className="py-1 pr-4">Fecha</th>
                    <th className="py-1 pr-4 text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {mes.documentos.map((d, i) => (
                    <tr key={`${d.documento}-${d.tipo}-${i}`} className="border-t border-slate-200/70">
                      <td className="py-1 pr-4 text-slate-500">{NOMBRE_TIPO[d.tipo] ?? d.tipo}</td>
                      <td className="py-1 pr-4 tabular-nums text-slate-700">{d.documento}</td>
                      <td className="py-1 pr-4 text-slate-500">{formatDate(d.fecha)}</td>
                      <td className="py-1 pr-4 text-right tabular-nums text-slate-700">
                        {formatNumber(d.cantidad, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

const NOMBRE_TIPO: Record<string, string> = {
  compras: 'Ingreso compra',
  consumo: 'Salida interna',
  requerimientos: 'Requerimiento',
  ordenes: 'Orden de compra',
};

function Paso({
  numero,
  titulo,
  valor,
  detalle,
  destacado,
}: {
  numero: string;
  titulo: string;
  valor: string;
  detalle: string;
  destacado?: boolean;
}) {
  return (
    <div className={`rounded-lg bg-white p-3 ${destacado ? 'ring-2 ring-brand-300' : 'ring-1 ring-brand-100'}`}>
      <div className="flex items-center gap-1.5">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
          {numero}
        </span>
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{titulo}</p>
      </div>
      <p className={`mt-1 text-2xl font-semibold ${destacado ? 'text-brand-700' : 'text-slate-800'}`}>
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{detalle}</p>
    </div>
  );
}

function Linea({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate-500">{etiqueta}</dt>
      <dd className={`tabular-nums ${destacado ? 'font-bold text-brand-700' : 'text-slate-700'}`}>
        {valor}
      </dd>
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
