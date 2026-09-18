import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Inbox, RotateCcw, XCircle } from 'lucide-react';
import { cancelarLote, fetchItemsLote, fetchLotes, reintentarUnidad } from '@/services/botService';
import type { EstadoUnidad, LoteBot, UnidadBot } from '@/types/bot';
import { formatNumber } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

/**
 * La cola: qué se mandó al bot, qué ya registró y qué se le atragantó.
 *
 * Lo que aquí se cancela es solo lo que **todavía no se ha registrado**. Lo
 * que el bot ya escribió en NetComercial no se deshace desde esta pantalla:
 * eso se anula dentro del ERP, a mano. La distinción se dice en pantalla,
 * no solo en el código, porque es la clase de cosa que alguien asume mal
 * una vez y lamenta.
 */

const ESTADO: Record<EstadoUnidad, { texto: string; clases: string }> = {
  pendiente: { texto: 'Esperando', clases: 'bg-slate-100 text-slate-600 ring-slate-200' },
  en_proceso: { texto: 'Registrando ahora', clases: 'bg-sky-50 text-sky-700 ring-sky-200' },
  completado: { texto: 'Registrada', clases: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  fallido: { texto: 'Con error', clases: 'bg-rose-50 text-rose-700 ring-rose-200' },
  saltado: { texto: 'Saltada', clases: 'bg-amber-50 text-amber-700 ring-amber-200' },
  cancelado: { texto: 'Cancelada', clases: 'bg-slate-100 text-slate-400 ring-slate-200' },
};

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ColaBot() {
  const [lotes, setLotes] = useState<LoteBot[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);

  async function cargar() {
    try {
      const r = await fetchLotes();
      setLotes(r.lotes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la cola.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  if (cargando) return <LoadingState message="Leyendo la cola…" />;
  if (error) return <ErrorState message={error} onRetry={() => void cargar()} />;
  if (lotes.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="La cola está vacía"
        description="Cuando mandes órdenes desde «Órdenes a girar», aparecerán aquí con su estado."
      />
    );
  }

  return (
    <div className="space-y-2">
      {lotes.map((lote) => (
        <TarjetaLote
          key={lote.id}
          lote={lote}
          abierto={abierto === lote.id}
          onAlternar={() => setAbierto(abierto === lote.id ? null : lote.id)}
          onCambio={() => void cargar()}
        />
      ))}
    </div>
  );
}

function TarjetaLote({
  lote,
  abierto,
  onAlternar,
  onCambio,
}: {
  lote: LoteBot;
  abierto: boolean;
  onAlternar: () => void;
  onCambio: () => void;
}) {
  const [items, setItems] = useState<UnidadBot[] | null>(null);
  const [cargandoItems, setCargandoItems] = useState(false);

  useEffect(() => {
    if (!abierto || items !== null) return;
    setCargandoItems(true);
    fetchItemsLote(lote.id)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setCargandoItems(false));
  }, [abierto, items, lote.id]);

  async function cancelar() {
    if (
      !window.confirm(
        `Se cancelarán las ${lote.pendientes} órdenes que aún no se han registrado.\n\n` +
          'Lo que el bot ya registró en NetComercial NO se deshace desde aquí.',
      )
    )
      return;
    await cancelarLote(lote.id);
    setItems(null);
    onCambio();
  }

  async function reintentar(item: UnidadBot) {
    await reintentarUnidad(item.id);
    setItems(null);
    onCambio();
  }

  return (
    <article className="card overflow-hidden">
      <div className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-3">
        <button type="button" onClick={onAlternar} aria-expanded={abierto} className="flex-1 text-left">
          <p className="text-sm font-semibold text-slate-800">
            Envío #{lote.id}
            <span className="ml-2 text-xs font-normal text-slate-400">
              {fechaCorta(lote.creado)}
              {lote.solicitado_por && ` · ${lote.solicitado_por}`}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatNumber(lote.items)} órdenes · S/ {formatNumber(lote.valor, 0)}
            {lote.nota && ` · ${lote.nota}`}
          </p>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 text-[11px]">
            {lote.pendientes > 0 && <Pastilla n={lote.pendientes} texto="esperando" tono="slate" />}
            {lote.completados > 0 && (
              <Pastilla n={lote.completados} texto="registradas" tono="emerald" />
            )}
            {lote.fallidos > 0 && <Pastilla n={lote.fallidos} texto="con error" tono="rose" />}
          </div>

          {lote.pendientes > 0 && (
            <button
              type="button"
              onClick={() => void cancelar()}
              className="btn-ghost !px-2 !py-1.5 text-xs text-rose-600 hover:bg-rose-50"
              title="Cancelar lo que aún no se ha registrado"
            >
              <XCircle size={13} /> Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={onAlternar}
            aria-label={abierto ? 'Ocultar el detalle' : 'Ver el detalle'}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
          >
            {abierto ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </div>

      {abierto && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-4">
          {cargandoItems && <p className="text-xs text-slate-400">Cargando el detalle…</p>}
          {items && items.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-max text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Proveedor</th>
                    <th className="px-3 py-2 text-right font-semibold">Líneas</th>
                    <th className="px-3 py-2 text-right font-semibold">Importe</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 font-semibold">N.º de OC</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-t border-slate-100">
                      <td className="max-w-[260px] px-3 py-2">
                        <p className="truncate font-medium text-slate-700" title={i.etiqueta}>
                          {i.etiqueta}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {i.clave}
                          {i.intentos > 0 && ` · ${i.intentos} intento${i.intentos === 1 ? '' : 's'}`}
                        </p>
                        {i.error && <p className="mt-0.5 text-[11px] text-rose-600">{i.error}</p>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {formatNumber(i.n_detalles)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {formatNumber(i.valor, 0)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${ESTADO[i.estado].clases}`}
                        >
                          {ESTADO[i.estado].texto}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        {i.resultado || '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {(i.estado === 'fallido' || i.estado === 'saltado' || i.estado === 'cancelado') && (
                          <button
                            type="button"
                            onClick={() => void reintentar(i)}
                            className="btn-ghost !px-2 !py-1 text-[11px]"
                            title="Devolver esta orden a la cola"
                          >
                            <RotateCcw size={12} /> Reintentar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Pastilla({ n, texto, tono }: { n: number; texto: string; tono: string }) {
  const clases: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 font-medium ${clases[tono]}`}>
      {formatNumber(n)} {texto}
    </span>
  );
}
