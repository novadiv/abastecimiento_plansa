import { AlertCircle, AlertTriangle, Coins, Package, ShoppingCart } from 'lucide-react';
import { formatCompactCurrency, formatNumber } from '@/utils/formatters';
import type { EstadoAbastecimiento, ResumenConsolidado } from '@/types/abastecimiento';

interface Props {
  resumen: ResumenConsolidado;
  estadoFiltro: EstadoAbastecimiento | 'todos';
  onEstadoFiltro: (estado: EstadoAbastecimiento | 'todos') => void;
}

/**
 * Cabecera de cifras. Las tres tarjetas de estado son además filtros: pulsar
 * "Críticos" deja en la tabla solo esos, que es el gesto natural cuando se
 * entra a ver qué hay que comprar hoy.
 */
export function AbastecimientoKPIs({ resumen, estadoFiltro, onEstadoFiltro }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Tarjeta
        etiqueta="Productos consolidados"
        valor={formatNumber(resumen.productos)}
        detalle={`${formatNumber(resumen.documentos)} requerimientos · ${formatNumber(resumen.lineas)} líneas`}
        Icono={Package}
        acento="bg-slate-100 text-slate-600"
      />
      <Tarjeta
        etiqueta="Hay que comprar"
        valor={formatNumber(resumen.productos_por_comprar)}
        detalle={`de ${formatNumber(resumen.productos)} productos`}
        Icono={ShoppingCart}
        acento="bg-brand-50 text-brand-600"
      />
      <Tarjeta
        etiqueta="Importe estimado"
        valor={formatCompactCurrency(resumen.importe_estimado, 'PEN')}
        detalle={`Cobertura de ${resumen.meses_objetivo} meses`}
        Icono={Coins}
        acento="bg-emerald-50 text-emerald-600"
      />
      <Tarjeta
        etiqueta="Críticos"
        valor={formatNumber(resumen.criticos)}
        detalle="Sin stock o a punto de agotarse"
        Icono={AlertCircle}
        acento="bg-rose-50 text-rose-600"
        activo={estadoFiltro === 'critico'}
        onClick={() => onEstadoFiltro(estadoFiltro === 'critico' ? 'todos' : 'critico')}
      />
      <Tarjeta
        etiqueta="Urgentes"
        valor={formatNumber(resumen.urgentes)}
        detalle="Cubren menos de medio periodo"
        Icono={AlertTriangle}
        acento="bg-orange-50 text-orange-600"
        activo={estadoFiltro === 'urgente'}
        onClick={() => onEstadoFiltro(estadoFiltro === 'urgente' ? 'todos' : 'urgente')}
      />
    </div>
  );
}

interface TarjetaProps {
  etiqueta: string;
  valor: string;
  detalle: string;
  Icono: typeof Package;
  acento: string;
  activo?: boolean;
  onClick?: () => void;
}

function Tarjeta({ etiqueta, valor, detalle, Icono, acento, activo, onClick }: TarjetaProps) {
  const contenido = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{etiqueta}</p>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${acento}`}>
          <Icono size={16} strokeWidth={2} />
        </div>
      </div>
      <p className="text-2xl font-semibold text-slate-800">{valor}</p>
      <p className="text-[11px] leading-tight text-slate-400">{detalle}</p>
    </>
  );

  if (!onClick) {
    return <div className="card flex flex-col gap-2 p-4">{contenido}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`card flex flex-col gap-2 p-4 text-left transition-colors hover:bg-slate-50 ${
        activo ? 'ring-2 ring-brand-400' : ''
      }`}
    >
      {contenido}
    </button>
  );
}
