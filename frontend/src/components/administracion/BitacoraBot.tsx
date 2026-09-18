import { useEffect, useState } from 'react';
import { AlertTriangle, Camera, ChevronDown, ChevronRight, Filter, History } from 'lucide-react';
import { fetchEjecuciones, fetchEventos, urlCaptura } from '@/services/botService';
import type { EjecucionBot, EstadoEjecucion, EventoBot } from '@/types/bot';
import { formatNumber } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

/**
 * La bitácora: qué hizo el bot, paso a paso, y la foto del momento exacto
 * en que algo se rompió.
 *
 * Esta es la pantalla que decide si el bot es mantenible o es una caja
 * negra que nadie se atreve a tocar. Cada paso deja su línea; cada fallo,
 * además, una captura de pantalla. No hay que reproducir nada ni adivinar:
 * está la imagen.
 */

const ESTADO: Record<EstadoEjecucion, { texto: string; clases: string }> = {
  en_cola: { texto: 'En cola', clases: 'bg-slate-100 text-slate-600 ring-slate-200' },
  corriendo: { texto: 'Corriendo ahora', clases: 'bg-sky-50 text-sky-700 ring-sky-200' },
  pausada: { texto: 'Pausada', clases: 'bg-amber-50 text-amber-700 ring-amber-200' },
  completada: { texto: 'Terminó bien', clases: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  fallida: { texto: 'Terminó con fallos', clases: 'bg-rose-50 text-rose-700 ring-rose-200' },
  abortada: { texto: 'Se cortó sin avisar', clases: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

const NIVEL: Record<string, string> = {
  info: 'text-slate-500',
  aviso: 'text-amber-600',
  error: 'text-rose-600',
};

function hora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('es-PE', { hour12: false });
}

function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function BitacoraBot() {
  const [ejecuciones, setEjecuciones] = useState<EjecucionBot[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);

  useEffect(() => {
    fetchEjecuciones()
      .then((r) => setEjecuciones(r.ejecuciones))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'No se pudo leer la bitácora.'),
      )
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <LoadingState message="Leyendo la bitácora…" />;
  if (error) return <ErrorState message={error} />;
  if (ejecuciones.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="El bot todavía no ha corrido ninguna vez"
        description="Cuando corra, aquí queda el detalle de cada paso y la captura de lo que falle."
      />
    );
  }

  return (
    <div className="space-y-2">
      {ejecuciones.map((e) => (
        <TarjetaEjecucion
          key={e.id}
          ejecucion={e}
          abierta={abierta === e.id}
          onAlternar={() => setAbierta(abierta === e.id ? null : e.id)}
        />
      ))}
    </div>
  );
}

function TarjetaEjecucion({
  ejecucion,
  abierta,
  onAlternar,
}: {
  ejecucion: EjecucionBot;
  abierta: boolean;
  onAlternar: () => void;
}) {
  const [eventos, setEventos] = useState<EventoBot[] | null>(null);
  const [soloErrores, setSoloErrores] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [captura, setCaptura] = useState<string | null>(null);

  useEffect(() => {
    if (!abierta) return;
    setCargando(true);
    fetchEventos(ejecucion.id, soloErrores)
      .then((r) => setEventos(r.eventos))
      .catch(() => setEventos([]))
      .finally(() => setCargando(false));
  }, [abierta, soloErrores, ejecucion.id]);

  const e = ESTADO[ejecucion.estado];

  return (
    <article className="card overflow-hidden">
      <div className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-3">
        <button type="button" onClick={onAlternar} aria-expanded={abierta} className="flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm font-semibold text-slate-800">{ejecucion.job_id}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${e.clases}`}>
              {e.texto}
            </span>
            {(ejecucion.errores ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                <AlertTriangle size={11} /> {formatNumber(ejecucion.errores ?? 0)} errores
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {fechaCorta(ejecucion.inicio ?? ejecucion.creado)} ·{' '}
            {ejecucion.disparo === 'horario' ? 'por horario' : 'lanzada a mano'} ·{' '}
            {formatNumber(ejecucion.exitosos)} ok, {formatNumber(ejecucion.fallidos)} con error,{' '}
            {formatNumber(ejecucion.saltados)} saltadas
          </p>
          {ejecucion.error && (
            <p className="mt-1 text-xs text-rose-600">{ejecucion.error}</p>
          )}
        </button>

        <div className="flex items-center gap-3">
          {ejecucion.estado === 'corriendo' && (
            <div className="w-32">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${ejecucion.progreso}%` }}
                />
              </div>
              <p className="mt-1 truncate text-[11px] text-slate-400" title={ejecucion.paso_actual}>
                {ejecucion.paso_actual}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onAlternar}
            aria-label={abierta ? 'Ocultar la bitácora' : 'Ver la bitácora'}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
          >
            {abierta ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </div>

      {abierta && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {eventos ? `${formatNumber(eventos.length)} pasos registrados` : 'Cargando…'}
            </p>
            <button
              type="button"
              onClick={() => setSoloErrores((v) => !v)}
              className={`btn-ghost !px-2 !py-1 text-xs ${soloErrores ? 'bg-rose-50 text-rose-700' : ''}`}
            >
              <Filter size={12} /> {soloErrores ? 'Viendo solo errores' : 'Ver solo errores'}
            </button>
          </div>

          {cargando && <p className="text-xs text-slate-400">Cargando los pasos…</p>}

          {eventos && eventos.length === 0 && !cargando && (
            <p className="text-xs text-slate-400">
              {soloErrores ? 'Ningún error en esta corrida.' : 'Sin pasos registrados.'}
            </p>
          )}

          {eventos && eventos.length > 0 && (
            <ol className="space-y-1">
              {eventos.map((ev) => (
                <li
                  key={ev.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-100"
                >
                  <span className="font-mono tabular-nums text-slate-400">{hora(ev.momento)}</span>
                  <span className={`font-medium ${NIVEL[ev.nivel] ?? NIVEL.info}`}>{ev.paso}</span>
                  <span className="flex-1 text-slate-600">{ev.mensaje}</span>
                  {ev.etiqueta && <span className="text-slate-400">{ev.etiqueta}</span>}
                  {ev.captura && (
                    <button
                      type="button"
                      onClick={() => setCaptura(ev.captura)}
                      className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-200"
                    >
                      <Camera size={11} /> Ver la pantalla
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {captura && <VisorCaptura nombre={captura} onCerrar={() => setCaptura(null)} />}
    </article>
  );
}

function VisorCaptura({ nombre, onCerrar }: { nombre: string; onCerrar: () => void }) {
  const [fallo, setFallo] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onCerrar}
      role="presentation"
    >
      <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-xl bg-white p-2 shadow-xl">
        <p className="px-2 py-1 font-mono text-[11px] text-slate-400">{nombre}</p>
        {fallo ? (
          <p className="p-8 text-center text-sm text-slate-500">
            La captura ya no está en disco. Las capturas viven en la carpeta del bot y se pueden
            haber limpiado.
          </p>
        ) : (
          <img
            src={urlCaptura(nombre)}
            alt={`Pantalla en el momento del error: ${nombre}`}
            className="w-full rounded-lg"
            onError={() => setFallo(true)}
          />
        )}
      </div>
    </div>
  );
}
