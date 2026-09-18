import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  Inbox,
  Pause,
  Play,
  RefreshCw,
  Square,
  Stethoscope,
} from 'lucide-react';
import { useEstadoBot } from '@/hooks/useEstadoBot';
import { controlarEjecucion } from '@/services/botService';
import { formatNumber } from '@/utils/formatters';
import { HorariosBot } from '@/components/administracion/HorariosBot';
import { ColaBot } from '@/components/administracion/ColaBot';
import { BitacoraBot } from '@/components/administracion/BitacoraBot';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import type { EstadoBot } from '@/types/bot';

/**
 * Administración: todo lo que gobierna el bot RPA.
 *
 * Cuatro secciones detrás de cuatro tarjetas, y arriba del todo lo único
 * que hace falta mirar de un vistazo — si el bot está trabajando ahora
 * mismo, cuánto le queda, y si algo se rompió.
 */

type Seccion = 'inicio' | 'horarios' | 'cola' | 'bitacora' | 'diagnostico';

const SECCIONES: {
  clave: Exclude<Seccion, 'inicio'>;
  titulo: string;
  descripcion: string;
  icono: typeof Clock;
  acento: string;
}[] = [
  {
    clave: 'horarios',
    titulo: 'Horarios del bot',
    descripcion:
      'A qué horas y qué días se despierta el bot, cuánto avisa antes de tomar el control y cuántas órdenes registra como mucho de una vez.',
    icono: Clock,
    acento: 'bg-brand-50 text-brand-600',
  },
  {
    clave: 'cola',
    titulo: 'Cola del bot',
    descripcion:
      'Lo que está esperando a que el bot lo registre, lo que ya registró con su número de OC, y lo que se le atragantó.',
    icono: Inbox,
    acento: 'bg-emerald-50 text-emerald-600',
  },
  {
    clave: 'bitacora',
    titulo: 'Bitácora y errores',
    descripcion:
      'Cada corrida paso a paso, con la captura de pantalla del momento exacto en que algo falló.',
    icono: History,
    acento: 'bg-amber-50 text-amber-600',
  },
  {
    clave: 'diagnostico',
    titulo: 'Diagnóstico',
    descripcion:
      'Si el bot está bien configurado para poder correr: token, horarios y proceso encendido.',
    icono: Stethoscope,
    acento: 'bg-slate-100 text-slate-600',
  },
];

export function Administracion() {
  const [seccion, setSeccion] = useState<Seccion>('inicio');
  const { estado, cargando, error, refrescar } = useEstadoBot();

  const actual = SECCIONES.find((s) => s.clave === seccion);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {seccion !== 'inicio' && (
            <button
              type="button"
              onClick={() => setSeccion('inicio')}
              className="btn-ghost mb-1.5 !px-2 !py-1 text-xs"
            >
              <ArrowLeft size={13} /> Administración
            </button>
          )}
          <h1 className="text-xl font-semibold text-slate-800">
            {actual ? actual.titulo : 'Administración'}
          </h1>
          <p className="text-sm text-slate-500">
            {actual
              ? actual.descripcion
              : 'El bot que registra en NetComercial: cuándo corre, qué tiene pendiente y qué pasó en cada corrida.'}
          </p>
        </div>
        <button type="button" onClick={() => void refrescar()} className="btn-secondary">
          <RefreshCw size={14} /> Actualizar
        </button>
      </header>

      {cargando && !estado && <LoadingState message="Consultando el estado del bot…" />}
      {error && !estado && <ErrorState message={error} onRetry={() => void refrescar()} />}

      {estado && (
        <>
          <PanelEstado estado={estado} onCambio={refrescar} />

          {seccion === 'inicio' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {SECCIONES.map((s) => (
                <button
                  key={s.clave}
                  type="button"
                  onClick={() => setSeccion(s.clave)}
                  className="card flex items-start gap-4 p-4 text-left transition-colors hover:bg-slate-50"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.acento}`}
                  >
                    <s.icono size={19} strokeWidth={1.9} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      {s.titulo}
                      <Etiqueta clave={s.clave} estado={estado} />
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{s.descripcion}</p>
                  </div>
                  <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          )}

          {seccion === 'horarios' && <HorariosBot />}
          {seccion === 'cola' && <ColaBot />}
          {seccion === 'bitacora' && <BitacoraBot />}
          {seccion === 'diagnostico' && <Diagnostico estado={estado} />}
        </>
      )}
    </div>
  );
}

/** El contador que va en la tarjeta, cuando hay algo que contar. */
function Etiqueta({ clave, estado }: { clave: string; estado: EstadoBot }) {
  if (clave === 'horarios' && estado.horarios_activos > 0) {
    return <Pastilla texto={`${estado.horarios_activos} activos`} tono="brand" />;
  }
  if (clave === 'cola' && estado.pendientes > 0) {
    return <Pastilla texto={`${formatNumber(estado.pendientes)} esperando`} tono="amber" />;
  }
  if (clave === 'bitacora' && estado.fallidos > 0) {
    return <Pastilla texto={`${formatNumber(estado.fallidos)} con error`} tono="rose" />;
  }
  if (clave === 'diagnostico' && !estado.configurado) {
    return <Pastilla texto="sin configurar" tono="rose" />;
  }
  return null;
}

function Pastilla({ texto, tono }: { texto: string; tono: 'brand' | 'amber' | 'rose' }) {
  const clases = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tono];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${clases}`}>{texto}</span>
  );
}

/** Lo que hay que ver de un vistazo, esté uno en la sección que esté. */
function PanelEstado({ estado, onCambio }: { estado: EstadoBot; onCambio: () => void }) {
  const viva = estado.ejecucion_viva;

  async function controlar(accion: 'pausar' | 'reanudar' | 'detener') {
    if (!viva) return;
    if (accion === 'detener' && !window.confirm('¿Detener la corrida en marcha?\n\nLo que quede sin registrar vuelve a la cola.')) {
      return;
    }
    await controlarEjecucion(viva.id, accion);
    onCambio();
  }

  if (!estado.configurado) {
    return (
      <div className="card flex items-start gap-3 border-rose-200 bg-rose-50 p-4">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
        <div className="text-sm text-rose-900">
          <p className="font-semibold">El bot todavía no puede correr.</p>
          <p className="mt-0.5 text-xs">
            Falta definir <code className="rounded bg-rose-100 px-1">BOT_TOKEN</code> en el archivo{' '}
            <code className="rounded bg-rose-100 px-1">.env</code> de la raíz del proyecto. Sin ese
            token, el proceso del bot no puede reportar nada y todas sus peticiones se rechazan.
          </p>
        </div>
      </div>
    );
  }

  if (viva) {
    return (
      <div className="card border-sky-200 bg-sky-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-[240px] flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-sky-900">
              <Bot size={16} /> El bot está trabajando ahora mismo
              <span className="font-mono text-xs font-normal text-sky-700">{viva.job_id}</span>
            </p>
            <p className="mt-1 text-xs text-sky-800">{viva.paso_actual || 'Arrancando…'}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-200">
              <div
                className="h-full rounded-full bg-sky-600 transition-all"
                style={{ width: `${viva.progreso}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-sky-700">
              {formatNumber(viva.exitosos)} de {formatNumber(viva.total)} registradas
              {viva.fallidos > 0 && ` · ${formatNumber(viva.fallidos)} con error`}
            </p>
          </div>

          <div className="flex gap-2">
            {viva.estado === 'pausada' ? (
              <button type="button" onClick={() => void controlar('reanudar')} className="btn-secondary">
                <Play size={14} /> Reanudar
              </button>
            ) : (
              <button type="button" onClick={() => void controlar('pausar')} className="btn-secondary">
                <Pause size={14} /> Pausar
              </button>
            )}
            <button
              type="button"
              onClick={() => void controlar('detener')}
              className="btn-secondary !text-rose-700"
            >
              <Square size={14} /> Detener
            </button>
          </div>
        </div>
        <p className="mt-3 border-t border-sky-200 pt-2 text-[11px] text-sky-700">
          Las órdenes se atienden entre unidad y unidad: el bot termina la orden que tiene entre
          manos antes de hacerte caso. Nunca deja un documento a medias.
        </p>
      </div>
    );
  }

  const ultima = estado.ultima_ejecucion;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Cifra
        etiqueta="Esperando al bot"
        valor={formatNumber(estado.pendientes)}
        nota={
          estado.pendientes > 0
            ? `S/ ${formatNumber(estado.valor_pendiente, 0)} en órdenes`
            : 'nada pendiente'
        }
        tono={estado.pendientes > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}
      />
      <Cifra
        etiqueta="Con error"
        valor={formatNumber(estado.fallidos)}
        nota={estado.fallidos > 0 ? 'revisa la bitácora' : 'ninguna'}
        tono={estado.fallidos > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}
      />
      <Cifra
        etiqueta="Última corrida"
        valor={ultima ? `${formatNumber(ultima.exitosos)} ok` : '—'}
        nota={
          ultima
            ? `${ultima.job_id} · ${formatNumber(ultima.fallidos)} con error`
            : 'el bot aún no ha corrido'
        }
        tono="bg-slate-100 text-slate-500"
      />
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  nota,
  tono,
}: {
  etiqueta: string;
  valor: string;
  nota: string;
  tono: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{etiqueta}</p>
        <div className={`h-2 w-2 rounded-full ${tono.split(' ')[0]}`} />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-800">{valor}</p>
      <p className="mt-0.5 truncate text-[11px] text-slate-400" title={nota}>
        {nota}
      </p>
    </div>
  );
}

function Diagnostico({ estado }: { estado: EstadoBot }) {
  const comprobaciones = [
    {
      ok: estado.configurado,
      titulo: 'Token del bot definido',
      detalle: estado.configurado
        ? 'El backend y el bot comparten el mismo secreto.'
        : 'Falta BOT_TOKEN en el .env de la raíz. Sin él, el bot no puede reportar nada.',
    },
    {
      ok: estado.horarios_activos > 0,
      titulo: 'Hay horarios activos',
      detalle:
        estado.horarios_activos > 0
          ? `${estado.horarios_activos} horario(s) encendido(s).`
          : 'Sin horarios, el bot solo corre si alguien lo lanza a mano.',
    },
    {
      ok: estado.tareas.some((t) => t.activa === 1),
      titulo: 'Hay una tarea configurada',
      detalle: estado.tareas.map((t) => `${t.nombre} → estrategia «${t.estrategia}»`).join(' · '),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="card divide-y divide-slate-100">
        {comprobaciones.map((c) => (
          <div key={c.titulo} className="flex items-start gap-3 p-4">
            {c.ok ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            )}
            <div>
              <p className="text-sm font-medium text-slate-800">{c.titulo}</p>
              <p className="mt-0.5 text-xs text-slate-500">{c.detalle}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <h4 className="text-sm font-semibold text-slate-800">Para que el bot corra solo</h4>
        <ol className="mt-2 space-y-2 text-xs text-slate-600">
          <li>
            <strong>1.</strong> El backend tiene que estar encendido:{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">INICIAR_BACKEND.bat</code>
          </li>
          <li>
            <strong>2.</strong> Y el programador del bot también:{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">INICIAR_BOT.bat</code> (déjalo con
            su ventana abierta)
          </li>
          <li>
            <strong>3.</strong> La sesión de Windows tiene que estar <strong>desbloqueada</strong>.
            Si la pantalla se bloquea, el bot deja de ver y falla en seco.
          </li>
        </ol>
        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
          Base de la cola: <code className="font-mono">{estado.archivo}</code>
        </p>
      </div>
    </div>
  );
}
