import { useMemo, useState } from 'react';
import { AlertTriangle, Bot, Check, Clock, X } from 'lucide-react';
import { encolarUnidades } from '@/services/botService';
import { useAuthContext } from '@/context/AuthContext';
import { formatNumber } from '@/utils/formatters';
import type { RespuestaEncolar, UnidadAEncolar } from '@/types/bot';
import type { OrdenProveedor } from '@/types/abastecimiento';

/**
 * Confirmación antes de mandar órdenes al bot.
 *
 * El bot escribe de verdad en NetComercial, y una orden de más no se
 * deshace desde aquí — se deshace entrando al ERP a mano. Así que este
 * modal no es un trámite: enseña exactamente qué proveedores, cuántas
 * líneas y por cuánto dinero, antes de que nadie pulse nada.
 *
 * Lo que se encola es el contenido **congelado** de cada orden, no una
 * referencia al plan. El plan se recalcula cada vez que alguien abre la
 * pantalla; lo que el bot debe registrar es lo que se vio y se aprobó aquí.
 */

interface Props {
  ordenes: OrdenProveedor[];
  /** Con qué filtros se armó el plan, para dejarlo anotado en el lote. */
  parametros: Record<string, unknown>;
  onCerrar: () => void;
  onEnviado?: (respuesta: RespuestaEncolar) => void;
}

export function EnviarAlBotModal({ ordenes, parametros, onCerrar, onEnviado }: Props) {
  const { user } = useAuthContext();
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespuestaEncolar | null>(null);

  const totales = useMemo(
    () => ({
      lineas: ordenes.reduce((n, o) => n + o.n_lineas, 0),
      importe: ordenes.reduce((n, o) => n + o.importe, 0),
    }),
    [ordenes],
  );

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      const unidades: UnidadAEncolar[] = ordenes.map((o) => ({
        clave: o.proveedor_id,
        etiqueta: o.proveedor,
        valor: o.importe,
        n_detalles: o.n_lineas,
        payload: {
          proveedor_id: o.proveedor_id,
          proveedor: o.proveedor,
          ciclo_meses: o.ciclo_meses,
          urgencia: o.urgencia,
          compradores: o.compradores,
          importe: o.importe,
          lineas: o.lineas.map((l) => ({
            codigo: l.codigo,
            descripcion: l.descripcion,
            unidad: l.unidad,
            cantidad: l.cantidad,
            precio: l.precio,
            importe: l.importe,
          })),
        },
      }));

      const respuesta = await encolarUnidades({
        unidades,
        solicitadoPor: user?.usuario ?? '',
        nota,
        parametros,
      });
      setResultado(respuesta);
      onEnviado?.(respuesta);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo mandar el trabajo a la cola del bot.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Bot size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                {resultado ? 'Trabajo enviado a la cola' : 'Mandar al bot para que las registre'}
              </h3>
              <p className="text-xs text-slate-400">
                {resultado
                  ? 'El bot las registrará cuando le toque su próximo horario.'
                  : `${formatNumber(ordenes.length)} ${ordenes.length === 1 ? 'orden' : 'órdenes'} · ${formatNumber(totales.lineas)} líneas · S/ ${formatNumber(totales.importe, 0)}`}
              </p>
            </div>
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
          {resultado ? (
            <Resumen resultado={resultado} />
          ) : (
            <>
              <div className="mb-4 flex gap-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>
                  El bot va a <strong>escribir en NetComercial</strong> con tu usuario, y ahí
                  quedará registrado como si lo hubieras hecho tú. Una orden de más no se
                  deshace desde esta pantalla: hay que anularla dentro del ERP. Revisa la lista
                  antes de continuar.
                </p>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">Proveedor</th>
                      <th className="px-3 py-2 text-right font-semibold">Líneas</th>
                      <th className="px-3 py-2 text-right font-semibold">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenes.map((o) => (
                      <tr key={o.proveedor_id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-700">{o.proveedor}</p>
                          <p className="text-[11px] text-slate-400">{o.proveedor_id}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {formatNumber(o.n_lineas)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">
                          S/ {formatNumber(o.importe, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50">
                    <tr className="border-t border-slate-200 text-sm font-semibold text-slate-800">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(totales.lineas)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        S/ {formatNumber(totales.importe, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-4">
                <label className="label-text" htmlFor="nota-bot">
                  Nota para este envío (opcional)
                </label>
                <input
                  id="nota-bot"
                  type="text"
                  className="input"
                  placeholder="Ej.: reposición de setiembre"
                  value={nota}
                  maxLength={200}
                  onChange={(e) => setNota(e.target.value)}
                />
              </div>

              {error && (
                <p className="mt-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-800 ring-1 ring-rose-200">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
          <p className="text-xs text-slate-400">
            {resultado ? (
              <>
                Puedes seguir su avance en <strong>Administración → Cola del bot</strong>.
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Clock size={13} />
                Se registrarán en el próximo horario programado.
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onCerrar} className="btn-secondary">
              {resultado ? 'Cerrar' : 'Cancelar'}
            </button>
            {!resultado && (
              <button
                type="button"
                onClick={() => void enviar()}
                className="btn-primary"
                disabled={enviando || ordenes.length === 0}
              >
                {enviando ? 'Enviando…' : `Mandar ${formatNumber(ordenes.length)} al bot`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Resumen({ resultado }: { resultado: RespuestaEncolar }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
        <Check size={16} className="mt-0.5 shrink-0" />
        <p>
          <strong>{formatNumber(resultado.aceptadas)}</strong>{' '}
          {resultado.aceptadas === 1 ? 'orden encolada' : 'órdenes encoladas'}. En total quedan{' '}
          {formatNumber(resultado.pendientes_totales)} esperando al bot.
        </p>
      </div>

      {resultado.rechazadas.length > 0 && (
        <div>
          <div className="mb-2 flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <p>
              <strong>{formatNumber(resultado.rechazadas.length)}</strong> no se encolaron porque
              ya estaban esperando. Se rechazan a propósito: mandarlas otra vez terminaría en dos
              órdenes iguales dentro del ERP.
            </p>
          </div>
          <ul className="space-y-1 text-xs text-slate-600">
            {resultado.rechazadas.map((r) => (
              <li key={r.clave} className="flex justify-between gap-3 rounded bg-slate-50 px-3 py-1.5">
                <span className="truncate">{r.etiqueta || r.clave}</span>
                <span className="shrink-0 text-slate-400">{r.motivo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
