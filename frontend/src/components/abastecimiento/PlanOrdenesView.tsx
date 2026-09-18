import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  Store,
  Wallet,
} from 'lucide-react';
import { fetchPlanOrdenes, type OpcionesPlan } from '@/services/abastecimientoService';
import { exportToCSV } from '@/services/exportService';
import type { OrdenProveedor, PlanOrdenes, Urgencia } from '@/types/abastecimiento';
import { formatDate, formatNumber } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { EnviarAlBotModal } from './EnviarAlBotModal';

/**
 * Vista «Órdenes a girar»: el plan de compra agrupado por proveedor.
 *
 * Una orden por proveedor, que es lo que produce la reducción de documentos.
 * Está redactada para que la entienda también la gerencia: sin jerga, con
 * cada estado acompañado de su palabra y no solo de un color, y con los
 * filtros resueltos en texto para que siempre se sepa qué se está mirando.
 */

const URGENCIA: Record<Urgencia, { texto: string; clases: string; orden: number }> = {
  'sin-stock': {
    texto: 'Sin stock',
    clases: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
    orden: 0,
  },
  'esta-semana': {
    texto: 'Se acaba esta semana',
    clases: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
    orden: 1,
  },
  'quince-dias': {
    texto: 'Se acaba en 15 días',
    clases: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    orden: 2,
  },
  'treinta-dias': {
    texto: 'Se acaba en un mes',
    clases: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    orden: 3,
  },
  holgado: {
    texto: 'Alcanza de sobra',
    clases: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    orden: 4,
  },
};

function textoCiclo(meses: number): string {
  if (meses === 1) return 'Comprarle todos los meses';
  if (meses === 12) return 'Comprarle una vez al año';
  return `Comprarle cada ${meses} meses`;
}

const COLUMNAS_CSV = [
  { key: 'proveedor', label: 'Proveedor' },
  { key: 'ciclo', label: 'Cada cuántos meses comprarle' },
  { key: 'comprador', label: 'Comprador' },
  { key: 'urgencia', label: 'Situación' },
  { key: 'codigo', label: 'Código' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'unidad', label: 'Unidad' },
  { key: 'stock_actual', label: 'Stock actual' },
  { key: 'en_camino', label: 'Ya pedido sin llegar' },
  { key: 'ritmo_mensual', label: 'Consumo al mes' },
  { key: 'cantidad', label: 'Cantidad a comprar' },
  { key: 'precio', label: 'Precio unitario S/' },
  { key: 'importe', label: 'Importe S/' },
];

interface Props {
  opciones: OpcionesPlan;
  /** Nombres legibles de los tipos excluidos, para decirlo en el encabezado. */
  etiquetasExcluidas?: string[];
}

export function PlanOrdenesView({ opciones, etiquetasExcluidas = [] }: Props) {
  const [plan, setPlan] = useState<PlanOrdenes | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [cicloFiltro, setCicloFiltro] = useState<number | 'todos'>('todos');
  const [urgenciaFiltro, setUrgenciaFiltro] = useState<Urgencia | 'todas'>('todas');
  // Las órdenes que están a punto de mandarse al bot: una sola desde su
  // tarjeta, o todas las que quedaron tras los filtros.
  const [aEnviar, setAEnviar] = useState<OrdenProveedor[] | null>(null);
  // Las que ya se mandaron en esta sesión, para no ofrecer mandarlas dos
  // veces. El backend también lo rechaza, pero decirlo antes es más honesto
  // que dejar pulsar un botón que no va a hacer nada.
  const [enviadas, setEnviadas] = useState<Set<string>>(new Set());

  const clave = JSON.stringify(opciones);
  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    fetchPlanOrdenes(opciones)
      .then((r) => {
        if (!cancelado) setPlan(r);
      })
      .catch((err: unknown) => {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'No fue posible armar el plan de órdenes.');
          setPlan(null);
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const visibles = useMemo(() => {
    if (!plan) return [];
    const texto = busqueda.trim().toLowerCase();
    return plan.ordenes
      .filter((o) => {
        if (cicloFiltro !== 'todos' && o.ciclo_meses !== cicloFiltro) return false;
        if (urgenciaFiltro !== 'todas' && o.urgencia !== urgenciaFiltro) return false;
        if (!texto) return true;
        return (
          o.proveedor.toLowerCase().includes(texto) ||
          o.lineas.some(
            (l) =>
              l.codigo.toLowerCase().includes(texto) ||
              l.descripcion.toLowerCase().includes(texto),
          )
        );
      })
      .sort((a, b) => {
        const ua = URGENCIA[a.urgencia].orden;
        const ub = URGENCIA[b.urgencia].orden;
        return ua !== ub ? ua - ub : b.importe - a.importe;
      });
  }, [plan, busqueda, cicloFiltro, urgenciaFiltro]);

  const hayFiltro = cicloFiltro !== 'todos' || urgenciaFiltro !== 'todas' || busqueda.trim() !== '';

  /** Lo que el botón de lote mandaría: lo visible menos lo ya enviado. */
  const sinEnviar = useMemo(
    () => visibles.filter((o) => !enviadas.has(o.proveedor_id)),
    [visibles, enviadas],
  );

  function exportar() {
    const filas = visibles.flatMap((o) =>
      o.lineas.map((l) => ({
        proveedor: o.proveedor,
        ciclo: o.ciclo_meses,
        comprador: l.comprador || 'Sin asignar',
        urgencia: URGENCIA[l.urgencia].texto,
        codigo: l.codigo,
        descripcion: l.descripcion,
        unidad: l.unidad,
        stock_actual: l.stock_actual,
        en_camino: l.en_camino,
        ritmo_mensual: l.ritmo_mensual,
        cantidad: l.cantidad,
        precio: l.precio,
        importe: l.importe,
      })),
    );
    exportToCSV(filas, COLUMNAS_CSV, `ordenes_a_girar_${opciones.desde}_${opciones.hasta}.csv`);
  }

  if (cargando) {
    return (
      <div className="card p-10">
        <LoadingState message="Armando el plan de órdenes. La primera consulta del periodo puede tardar un par de minutos; después se sirve al instante." />
      </div>
    );
  }
  if (error) return <ErrorState message={error} />;
  if (!plan) return null;

  const r = plan.resumen;
  const visiblesLineas = visibles.reduce((n, o) => n + o.n_lineas, 0);
  const visiblesImporte = visibles.reduce((n, o) => n + o.importe, 0);

  return (
    <div className="space-y-4">
      {/* ── Qué se está mirando ────────────────────────────────── */}
      <div className="card px-4 py-3">
        <p className="text-sm text-slate-700">
          Hay que comprarle a <strong>{formatNumber(r.ordenes_a_girar)} proveedores</strong>:{' '}
          {formatNumber(r.lineas)} materiales por <strong>S/ {formatNumber(r.importe, 0)}</strong>.
          Una sola orden por proveedor, con todas sus líneas dentro.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
          <span>
            Periodo analizado:{' '}
            <strong className="text-slate-700">
              {formatDate(r.desde)} – {formatDate(r.hasta)}
            </strong>
          </span>
          <span>
            Consumo calculado sobre:{' '}
            <strong className="text-slate-700">{r.base_consumo_etiqueta}</strong>
          </span>
          <span>
            Cobertura: <strong className="text-slate-700">{r.meses_objetivo} meses</strong>
          </span>
          {r.comprador && (
            <span>
              Comprador: <strong className="text-slate-700">{r.comprador}</strong>
            </span>
          )}
          {r.codigos_excluidos > 0 && (
            <span>
              Excluido:{' '}
              <strong className="text-slate-700">
                {etiquetasExcluidas.length > 0
                  ? etiquetasExcluidas.join(', ')
                  : `${formatNumber(r.codigos_excluidos)} materiales`}
              </strong>{' '}
              ({formatNumber(r.codigos_excluidos)} materiales, S/{' '}
              {formatNumber(r.importe_excluido, 0)})
            </span>
          )}
        </div>
      </div>

      {/* ── Cifras ─────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta
          icono={Store}
          etiqueta="Órdenes a girar"
          valor={formatNumber(r.ordenes_a_girar)}
          nota="una por proveedor"
          acento="bg-brand-50 text-brand-600"
        />
        <Tarjeta
          icono={Wallet}
          etiqueta="Importe de esta compra"
          valor={`S/ ${formatNumber(r.importe, 0)}`}
          nota={`${formatNumber(r.lineas)} materiales`}
          acento="bg-emerald-50 text-emerald-600"
        />
        <Tarjeta
          icono={CalendarClock}
          etiqueta="Órdenes al mes con este plan"
          valor={formatNumber(r.ordenes_mes_plan, 0)}
          nota={`${formatNumber(r.ordenes_anio_plan)} al año`}
          acento="bg-slate-100 text-slate-600"
        />
        <Tarjeta
          icono={AlertCircle}
          etiqueta="Falta poner en almacén"
          valor={`S/ ${formatNumber(r.inversion_colchon, 0)}`}
          nota="compra inicial, una sola vez"
          acento="bg-amber-50 text-amber-600"
        />
      </div>

      {/* ── Cada cuánto comprarle a cada proveedor ─────────────── */}
      <section className="card p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-800">
            Cada cuánto conviene comprarle a cada proveedor
          </h3>
          <p className="text-xs text-slate-500">
            A los proveedores de mayor volumen conviene comprarles seguido; a los pequeños, juntar
            y comprar de una vez. Pulsa un renglón para ver solo esos proveedores.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Frecuencia</th>
                <th className="px-3 py-2 text-right font-semibold">Proveedores</th>
                <th className="px-3 py-2 text-right font-semibold">Materiales</th>
                <th className="px-3 py-2 text-right font-semibold">Se le compra al año</th>
                <th className="px-3 py-2 text-right font-semibold">Órdenes al año</th>
                <th className="px-3 py-2 text-right font-semibold">Falta en almacén</th>
              </tr>
            </thead>
            <tbody>
              {plan.por_ciclo.map((c) => {
                const activo = cicloFiltro === c.ciclo_meses;
                return (
                  <tr
                    key={c.ciclo_meses}
                    onClick={() => setCicloFiltro(activo ? 'todos' : c.ciclo_meses)}
                    className={`cursor-pointer border-t border-slate-100 ${
                      activo ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-3 py-2.5 font-medium text-slate-700">
                      {textoCiclo(c.ciclo_meses)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {formatNumber(c.proveedores)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {formatNumber(c.codigos)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      S/ {formatNumber(c.valor_anual, 0)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-700">
                      {formatNumber(c.ordenes_anio, 0)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">
                      S/ {formatNumber(c.inversion, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Filtros ────────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label-text" htmlFor="buscar-orden">
              Buscar proveedor o material
            </label>
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="buscar-orden"
                type="search"
                className="input pl-8"
                placeholder="Nombre del proveedor, código o descripción"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label-text" htmlFor="filtro-ciclo">
              Frecuencia de compra
            </label>
            <select
              id="filtro-ciclo"
              className="input"
              value={cicloFiltro}
              onChange={(e) =>
                setCicloFiltro(e.target.value === 'todos' ? 'todos' : Number(e.target.value))
              }
            >
              <option value="todos">Todas las frecuencias</option>
              {plan.por_ciclo.map((c) => (
                <option key={c.ciclo_meses} value={c.ciclo_meses}>
                  {textoCiclo(c.ciclo_meses)} ({formatNumber(c.proveedores)} proveedores)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-text" htmlFor="filtro-urgencia">
              Situación del stock
            </label>
            <select
              id="filtro-urgencia"
              className="input"
              value={urgenciaFiltro}
              onChange={(e) => setUrgenciaFiltro(e.target.value as Urgencia | 'todas')}
            >
              <option value="todas">Todas las situaciones</option>
              {(Object.keys(URGENCIA) as Urgencia[]).map((u) => {
                const n = plan.ordenes.filter((o) => o.urgencia === u).length;
                if (n === 0) return null;
                return (
                  <option key={u} value={u}>
                    {URGENCIA[u].texto} ({formatNumber(n)} proveedores)
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            {hayFiltro ? (
              <>
                Mostrando <strong className="text-slate-700">{formatNumber(visibles.length)}</strong>{' '}
                de {formatNumber(plan.ordenes.length)} proveedores ·{' '}
                {formatNumber(visiblesLineas)} materiales · S/{' '}
                {formatNumber(visiblesImporte, 0)}
              </>
            ) : (
              <>
                Mostrando los {formatNumber(plan.ordenes.length)} proveedores del plan completo
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            {hayFiltro && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda('');
                  setCicloFiltro('todos');
                  setUrgenciaFiltro('todas');
                }}
                className="btn-ghost !px-2 !py-1 text-xs"
              >
                Quitar filtros
              </button>
            )}
            <button
              type="button"
              onClick={exportar}
              className="btn-secondary"
              disabled={visibles.length === 0}
            >
              <Download size={14} /> Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => setAEnviar(sinEnviar)}
              className="btn-primary"
              disabled={sinEnviar.length === 0}
              title={
                sinEnviar.length === 0
                  ? 'No queda ninguna orden por mandar con los filtros aplicados'
                  : 'Manda estas órdenes a la cola para que el bot las registre en NetComercial'
              }
            >
              <Bot size={14} /> Mandar {formatNumber(sinEnviar.length)} al bot
            </button>
          </div>
        </div>
      </div>

      {/* ── Las órdenes ────────────────────────────────────────── */}
      <div className="grid gap-2">
        {visibles.map((orden) => (
          <TarjetaOrden
            key={orden.proveedor_id}
            orden={orden}
            abierta={abierto === orden.proveedor_id}
            enviada={enviadas.has(orden.proveedor_id)}
            onAlternar={() =>
              setAbierto(abierto === orden.proveedor_id ? null : orden.proveedor_id)
            }
            onEnviarAlBot={() => setAEnviar([orden])}
          />
        ))}
        {visibles.length === 0 && (
          <EmptyState
            title="Sin resultados"
            description="Ningún proveedor coincide con los filtros aplicados. Prueba a quitarlos o a buscar otro término."
          />
        )}
      </div>

      {aEnviar && (
        <EnviarAlBotModal
          ordenes={aEnviar}
          parametros={{ ...opciones, proveedores: aEnviar.length }}
          onCerrar={() => setAEnviar(null)}
          onEnviado={(respuesta) => {
            // Solo se marcan las que el backend aceptó: las rechazadas por
            // duplicado ya estaban en la cola de antes.
            const rechazadas = new Set(respuesta.rechazadas.map((r) => r.clave));
            setEnviadas((previas) => {
              const siguiente = new Set(previas);
              aEnviar.forEach((o) => {
                if (!rechazadas.has(o.proveedor_id)) siguiente.add(o.proveedor_id);
              });
              return siguiente;
            });
          }}
        />
      )}
    </div>
  );
}

function TarjetaOrden({
  orden,
  abierta,
  enviada,
  onAlternar,
  onEnviarAlBot,
}: {
  orden: OrdenProveedor;
  abierta: boolean;
  enviada: boolean;
  onAlternar: () => void;
  onEnviarAlBot: () => void;
}) {
  const u = URGENCIA[orden.urgencia];
  return (
    <article className="card overflow-hidden">
      {/* Contenedor y no <button>: dentro va el botón de mandar al bot, y un
          botón anidado en otro botón no es HTML válido. */}
      <div className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-3">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          className="min-w-[220px] flex-1 rounded-lg text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">{orden.proveedor}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${u.clases}`}>
              {u.texto}
            </span>
            {enviada && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                <Bot size={11} /> En la cola del bot
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatNumber(orden.n_lineas)} material{orden.n_lineas === 1 ? '' : 'es'} ·{' '}
            {textoCiclo(orden.ciclo_meses).toLowerCase()}
            {orden.compradores.length > 0 && <> · compra {orden.compradores.join(' y ')}</>}
          </p>
        </button>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Total a comprar</p>
            <p className="text-lg font-semibold tabular-nums text-slate-800">
              S/ {formatNumber(orden.importe, 0)}
            </p>
          </div>

          <button
            type="button"
            onClick={onEnviarAlBot}
            disabled={enviada}
            className="btn-secondary !px-2.5 !py-1.5 text-xs"
            title={
              enviada
                ? 'Esta orden ya está esperando en la cola del bot'
                : `Mandar la orden de ${orden.proveedor} al bot`
            }
          >
            <Bot size={13} /> {enviada ? 'En cola' : 'Enviar al bot'}
          </button>

          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={abierta}
            aria-label={abierta ? 'Ocultar el detalle' : 'Ver el detalle'}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
          >
            {abierta ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </div>

      {abierta && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-4">
          {orden.inversion_colchon > 0 && (
            <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
              Para que este proveedor aguante {textoCiclo(orden.ciclo_meses).toLowerCase()} sin
              quiebres, falta poner en almacén{' '}
              <strong>S/ {formatNumber(orden.inversion_colchon, 0)}</strong> la primera vez.
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Material</th>
                  <th className="px-3 py-2 text-right font-semibold" title="Lo que hay hoy en almacén">
                    Tiene
                  </th>
                  <th className="px-3 py-2 text-right font-semibold" title="Ya pedido al proveedor y sin llegar">
                    Ya pedido
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">Gasta al mes</th>
                  <th className="px-3 py-2 text-right font-semibold">Comprar</th>
                  <th className="px-3 py-2 text-right font-semibold">Precio</th>
                  <th className="px-3 py-2 text-right font-semibold">Importe</th>
                  <th className="px-3 py-2 font-semibold">Situación</th>
                </tr>
              </thead>
              <tbody>
                {orden.lineas.map((l) => (
                  <tr key={l.codigo} className="border-t border-slate-100">
                    <td className="max-w-[280px] px-3 py-2">
                      <p className="truncate font-medium text-slate-700" title={l.descripcion}>
                        {l.descripcion}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {l.codigo}
                        {l.unidad && ` · ${l.unidad}`}
                        {l.comprador && ` · ${l.comprador}`}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {formatNumber(l.stock_actual, 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {l.en_camino > 0 ? formatNumber(l.en_camino, 0) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {formatNumber(l.ritmo_mensual, 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-700">
                      {formatNumber(l.cantidad, 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {formatNumber(l.precio, 2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {formatNumber(l.importe, 0)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${URGENCIA[l.urgencia].clases}`}
                      >
                        {URGENCIA[l.urgencia].texto}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}

function Tarjeta({
  icono: Icono,
  etiqueta,
  valor,
  nota,
  acento,
}: {
  icono: typeof Store;
  etiqueta: string;
  valor: string;
  nota: string;
  acento: string;
}) {
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{etiqueta}</p>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${acento}`}>
          <Icono size={16} strokeWidth={2} />
        </div>
      </div>
      <p className="text-2xl font-semibold tabular-nums text-slate-800">{valor}</p>
      <p className="text-[11px] leading-tight text-slate-400">{nota}</p>
    </div>
  );
}
