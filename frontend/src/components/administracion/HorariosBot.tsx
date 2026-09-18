import { useEffect, useState } from 'react';
import { Clock, Plus, Power, Trash2 } from 'lucide-react';
import {
  actualizarHorario,
  crearHorario,
  eliminarHorario,
  fetchHorarios,
} from '@/services/botService';
import type { HorarioBot, NuevoHorario } from '@/types/bot';
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

/**
 * Los horarios en que el bot se despierta.
 *
 * Cada horario define además dos cosas que merecen explicación en pantalla,
 * porque nadie las adivina: cuántos segundos avisa antes de tomar el
 * control de la computadora, y cuántas órdenes como mucho registra en una
 * sola corrida.
 */

const DIAS = [
  { valor: '1', corto: 'L', largo: 'lunes' },
  { valor: '2', corto: 'M', largo: 'martes' },
  { valor: '3', corto: 'X', largo: 'miércoles' },
  { valor: '4', corto: 'J', largo: 'jueves' },
  { valor: '5', corto: 'V', largo: 'viernes' },
  { valor: '6', corto: 'S', largo: 'sábado' },
  { valor: '7', corto: 'D', largo: 'domingo' },
];

const NUEVO: NuevoHorario = {
  nombre: '',
  hora: '18:30',
  dias: '1,2,3,4,5',
  activo: true,
  aviso_segundos: 60,
  max_items: 20,
};

function textoDias(dias: string): string {
  const puestos = dias.split(',').map((d) => d.trim());
  if (puestos.length === 7) return 'todos los días';
  if (dias === '1,2,3,4,5') return 'de lunes a viernes';
  return DIAS.filter((d) => puestos.includes(d.valor))
    .map((d) => d.largo)
    .join(', ');
}

export function HorariosBot() {
  const [horarios, setHorarios] = useState<HorarioBot[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<NuevoHorario | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    try {
      const r = await fetchHorarios();
      setHorarios(r.horarios);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron leer los horarios.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function guardar() {
    if (!formulario || !formulario.nombre.trim()) return;
    setGuardando(true);
    try {
      await crearHorario(formulario);
      setFormulario(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el horario.');
    } finally {
      setGuardando(false);
    }
  }

  async function alternar(h: HorarioBot) {
    await actualizarHorario(h.id, { activo: !h.activo });
    await cargar();
  }

  async function borrar(h: HorarioBot) {
    if (!window.confirm(`¿Borrar el horario «${h.nombre}»?`)) return;
    await eliminarHorario(h.id);
    await cargar();
  }

  if (cargando) return <LoadingState message="Leyendo los horarios…" />;
  if (error && horarios.length === 0) return <ErrorState message={error} />;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-sm text-slate-700">
          A estas horas el bot se despierta y registra lo que haya en la cola. Antes de tomar el
          control de la computadora avisa en pantalla completa, con cuenta regresiva y un botón
          para posponer.
        </p>
        <p className="mt-1.5 text-xs text-slate-400">
          Si a la hora señalada la cola está vacía, no avisa nada: se vuelve a dormir. Y si otra
          corrida sigue en marcha, este disparo se omite — el trabajo se queda en la cola para la
          próxima.
        </p>
      </div>

      {horarios.length === 0 && !formulario && (
        <EmptyState
          icon={Clock}
          title="Todavía no hay ningún horario"
          description="Sin horarios, el bot solo corre si alguien lo lanza a mano desde la consola."
          action={
            <button type="button" onClick={() => setFormulario(NUEVO)} className="btn-primary">
              <Plus size={14} /> Crear el primero
            </button>
          }
        />
      )}

      {horarios.map((h) => (
        <div key={h.id} className="card flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-12 w-16 shrink-0 items-center justify-center rounded-lg text-lg font-semibold tabular-nums ${
                h.activo ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {h.hora}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {h.nombre}
                {!h.activo && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                    Apagado
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500">
                {textoDias(h.dias)} · avisa {h.aviso_segundos} s antes ·{' '}
                {h.max_items ? `máximo ${h.max_items} órdenes por corrida` : 'sin tope de órdenes'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void alternar(h)}
              className="btn-secondary !px-2.5 !py-1.5 text-xs"
              title={h.activo ? 'Apagar este horario' : 'Encender este horario'}
            >
              <Power size={13} /> {h.activo ? 'Apagar' : 'Encender'}
            </button>
            <button
              type="button"
              onClick={() => void borrar(h)}
              className="btn-ghost !px-2 !py-1.5 text-xs text-rose-600 hover:bg-rose-50"
              aria-label={`Borrar el horario ${h.nombre}`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {formulario ? (
        <div className="card space-y-4 p-4">
          <h4 className="text-sm font-semibold text-slate-800">Nuevo horario</h4>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-text" htmlFor="h-nombre">
                Nombre
              </label>
              <input
                id="h-nombre"
                className="input"
                placeholder="Ej.: cierre del día"
                value={formulario.nombre}
                maxLength={80}
                onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
              />
            </div>
            <div>
              <label className="label-text" htmlFor="h-hora">
                Hora
              </label>
              <input
                id="h-hora"
                type="time"
                className="input"
                value={formulario.hora}
                onChange={(e) => setFormulario({ ...formulario, hora: e.target.value })}
              />
            </div>
          </div>

          <div>
            <span className="label-text">Días</span>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((d) => {
                const puestos = formulario.dias.split(',').filter(Boolean);
                const activo = puestos.includes(d.valor);
                return (
                  <button
                    key={d.valor}
                    type="button"
                    aria-pressed={activo}
                    aria-label={d.largo}
                    onClick={() => {
                      const siguiente = activo
                        ? puestos.filter((p) => p !== d.valor)
                        : [...puestos, d.valor].sort();
                      setFormulario({ ...formulario, dias: siguiente.join(',') });
                    }}
                    className={`h-9 w-9 rounded-lg text-sm font-semibold transition-colors ${
                      activo
                        ? 'bg-brand-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {d.corto}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-text" htmlFor="h-aviso">
                Segundos de aviso antes de empezar
              </label>
              <input
                id="h-aviso"
                type="number"
                min={0}
                max={900}
                className="input"
                value={formulario.aviso_segundos}
                onChange={(e) =>
                  setFormulario({ ...formulario, aviso_segundos: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-[11px] text-slate-400">
                En 0 arranca sin avisar. Solo tiene sentido en una máquina que nadie usa.
              </p>
            </div>
            <div>
              <label className="label-text" htmlFor="h-tope">
                Máximo de órdenes por corrida
              </label>
              <input
                id="h-tope"
                type="number"
                min={1}
                max={500}
                className="input"
                value={formulario.max_items ?? ''}
                placeholder="sin tope"
                onChange={(e) =>
                  setFormulario({
                    ...formulario,
                    max_items: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Evita que una corrida nocturna se convierta en seis horas sin vigilancia.
              </p>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 ring-1 ring-rose-200">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setFormulario(null)} className="btn-secondary">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void guardar()}
              className="btn-primary"
              disabled={guardando || !formulario.nombre.trim() || !formulario.dias}
            >
              {guardando ? 'Guardando…' : 'Guardar horario'}
            </button>
          </div>
        </div>
      ) : (
        horarios.length > 0 && (
          <button type="button" onClick={() => setFormulario(NUEVO)} className="btn-secondary">
            <Plus size={14} /> Agregar otro horario
          </button>
        )
      )}
    </div>
  );
}
