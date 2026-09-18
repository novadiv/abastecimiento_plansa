import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Eye,
  Store,
  Truck,
} from 'lucide-react';
import { formatDate, formatNumber } from '@/utils/formatters';
import type { ItemConsolidado } from '@/types/abastecimiento';
import type { OrdenTabla } from '@/hooks/useAbastecimiento';
import { EstadoBadge } from './EstadoBadge';

const POR_PAGINA = 50;

interface Props {
  items: ItemConsolidado[];
  orden: OrdenTabla;
  onOrden: (orden: OrdenTabla) => void;
  onVerDetalle: (codigo: string) => void;
  onVerHistorial: (codigo: string) => void;
  onVerSustento: (codigo: string) => void;
  onVerProveedores: (item: ItemConsolidado) => void;
}

export function ConsolidadoTable({
  items,
  orden,
  onOrden,
  onVerDetalle,
  onVerHistorial,
  onVerSustento,
  onVerProveedores,
}: Props) {
  const [pagina, setPagina] = useState(1);

  // Al cambiar el filtro o el orden, la página 3 de la lista anterior no
  // significa nada en la nueva: se vuelve al principio.
  useEffect(() => {
    setPagina(1);
  }, [items, orden]);

  const totalPaginas = Math.max(1, Math.ceil(items.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = items.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Requerimientos de almacén consolidados
          </h3>
          <p className="text-xs text-slate-400">
            {formatNumber(items.length)} productos · un renglón por código, sumando todos sus
            requerimientos
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="orden-tabla">
            Ordenar por
          </label>
          <select
            id="orden-tabla"
            className="input !w-auto !py-1.5 text-xs"
            value={orden}
            onChange={(e) => onOrden(e.target.value as OrdenTabla)}
          >
            <option value="importe">Importe estimado</option>
            <option value="sugerido">Cantidad a comprar</option>
            <option value="cobertura">Lo que antes se agota</option>
            <option value="pendiente">Pendiente sin atender</option>
            <option value="solicitado">Cantidad solicitada</option>
            <option value="codigo">Código</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Código</th>
              <th className="px-3 py-2.5 font-semibold">Descripción</th>
              <th className="px-3 py-2.5 text-right font-semibold" title="Total pedido por las áreas en el periodo">
                Solicitado
              </th>
              <th className="px-3 py-2.5 text-right font-semibold" title="Ya despachado de almacén contra esos requerimientos">
                Atendido
              </th>
              <th className="px-3 py-2.5 text-right font-semibold" title="Solicitado que todavía no se ha entregado">
                Pendiente
              </th>
              <th className="px-3 py-2.5 text-right font-semibold">Stock actual</th>
              <th
                className="px-3 py-2.5 text-right font-semibold"
                title="Ya pedido al proveedor y todavía sin llegar. Se descuenta de lo que hay que comprar."
              >
                En camino
              </th>
              <th
                className="px-3 py-2.5 text-right font-semibold"
                title="Salida media al mes según la base elegida. Haz clic en el número para ver cómo se calcula."
              >
                Ritmo/mes
              </th>
              <th className="px-3 py-2.5 text-right font-semibold" title="Fecha estimada en que el stock llega a cero">
                Se agota
              </th>
              <th className="px-3 py-2.5 text-right font-semibold" title="Cantidad a comprar para cubrir la cobertura objetivo">
                Comprar
              </th>
              <th className="px-3 py-2.5 text-right font-semibold">Importe</th>
              <th className="px-3 py-2.5 font-semibold">Estado</th>
              <th className="px-4 py-2.5 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((item) => (
              <tr key={item.codigo} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-700 tabular-nums">
                  {item.codigo}
                </td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <p className="truncate text-slate-700" title={item.descripcion}>
                    {item.descripcion}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {item.unidad && <span>{item.unidad} · </span>}
                    {item.documentos} req.
                    {item.familia && <span> · {item.familia}</span>}
                    {item.comprador && (
                      <span
                        className={
                          item.comprador_confianza === 'baja' ? 'text-amber-600' : 'text-slate-500'
                        }
                        title={
                          item.comprador_confianza === 'baja'
                            ? 'Varios compradores activos piden este código: la asignación es dudosa'
                            : `Asignado por ${item.comprador_origen === 'manual' ? 'corrección manual' : item.comprador_origen === 'relevo' ? 'relevo de comprador' : 'histórico de órdenes'}`
                        }
                      >
                        {' · '}
                        {item.comprador}
                        {item.comprador_confianza === 'baja' && ' ?'}
                      </span>
                    )}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                  {formatNumber(item.solicitado, 0)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                  {formatNumber(item.atendido, 0)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-700">
                  {formatNumber(item.pendiente, 0)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span className={item.stock_negativo ? 'text-rose-600' : 'text-slate-700'}>
                    {formatNumber(item.stock_actual, 0)}
                  </span>
                  {item.stock_negativo && (
                    <AlertTriangle
                      size={12}
                      className="ml-1 inline text-rose-500"
                      aria-label="Saldo negativo: el kardex está descuadrado"
                    />
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {item.en_camino > 0 ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                      title="Ya pedido al proveedor y sin llegar"
                    >
                      <Truck size={11} />
                      {formatNumber(item.en_camino, 0)}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {/* El ritmo es el número que más cuesta defender ante un jefe:
                      al pulsarlo se abre la demostración completa del cálculo. */}
                  <button
                    type="button"
                    onClick={() => onVerSustento(item.codigo)}
                    className="rounded px-1.5 py-0.5 text-sm font-medium tabular-nums text-brand-700 underline decoration-dotted underline-offset-2 hover:bg-brand-50"
                    title="Ver de dónde sale este número"
                  >
                    {formatNumber(item.ritmo_mensual, 0)}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">
                  {item.fecha_quiebre ? formatDate(item.fecha_quiebre) : '—'}
                  {item.cobertura_meses !== null && (
                    <span className="block text-[10px] text-slate-400">
                      {formatNumber(item.cobertura_meses, 1)} meses
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-brand-700">
                  {formatNumber(item.sugerido_comprar, 0)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                  {formatNumber(item.importe_estimado, 0)}
                </td>
                <td className="px-3 py-2.5">
                  <EstadoBadge estado={item.estado} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => onVerDetalle(item.codigo)}
                    className="btn-ghost !px-2 !py-1 text-xs text-brand-700 hover:bg-brand-50"
                    title="Ver los requerimientos que componen esta cantidad"
                  >
                    <Eye size={13} /> Ver detalles
                  </button>
                  <button
                    type="button"
                    onClick={() => onVerProveedores(item)}
                    className="btn-ghost !px-2 !py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                    title="Ver a qué proveedor comprarle y a qué precio"
                  >
                    <Store size={13} /> Proveedor
                  </button>
                  <button
                    type="button"
                    onClick={() => onVerHistorial(item.codigo)}
                    className="btn-ghost !px-2 !py-1 text-xs"
                    title="Ver la evolución de compras y consumo de este producto"
                  >
                    <BarChart3 size={13} /> Gráfica
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>
            {formatNumber((paginaSegura - 1) * POR_PAGINA + 1)}–
            {formatNumber(Math.min(paginaSegura * POR_PAGINA, items.length))} de{' '}
            {formatNumber(items.length)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary !px-2 !py-1"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaSegura === 1}
            >
              <ChevronLeft size={14} />
            </button>
            <span>
              Página {paginaSegura} de {totalPaginas}
            </span>
            <button
              type="button"
              className="btn-secondary !px-2 !py-1"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaSegura === totalPaginas}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
