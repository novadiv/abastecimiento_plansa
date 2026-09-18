import { AlertCircle, AlertTriangle, CheckCircle2, Clock, HelpCircle } from 'lucide-react';
import type { EstadoAbastecimiento } from '@/types/abastecimiento';

/**
 * Semáforo de reposición. El color nunca va solo: cada estado lleva icono y
 * texto, para que se entienda igual impreso en blanco y negro o por alguien
 * que no distinga los colores.
 */
const ESTILOS: Record<
  EstadoAbastecimiento,
  { etiqueta: string; clases: string; Icono: typeof AlertCircle; ayuda: string }
> = {
  critico: {
    etiqueta: 'Crítico',
    clases: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
    Icono: AlertCircle,
    ayuda: 'Sin stock o a punto de agotarse. Comprar ya.',
  },
  urgente: {
    etiqueta: 'Urgente',
    clases: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
    Icono: AlertTriangle,
    ayuda: 'El stock cubre menos de la mitad del periodo objetivo.',
  },
  atencion: {
    etiqueta: 'Atención',
    clases: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    Icono: Clock,
    ayuda: 'El stock no llega a cubrir el periodo objetivo completo.',
  },
  ok: {
    etiqueta: 'Abastecido',
    clases: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    Icono: CheckCircle2,
    ayuda: 'El stock cubre el periodo objetivo.',
  },
  'sin-consumo': {
    etiqueta: 'Sin ritmo',
    clases: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    Icono: HelpCircle,
    ayuda: 'No hay movimiento en el periodo para estimar un ritmo de consumo.',
  },
};

export function EstadoBadge({ estado }: { estado: EstadoAbastecimiento }) {
  const { etiqueta, clases, Icono, ayuda } = ESTILOS[estado];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${clases}`}
      title={ayuda}
    >
      <Icono size={12} strokeWidth={2.5} />
      {etiqueta}
    </span>
  );
}

export const ESTADOS_ORDENADOS: EstadoAbastecimiento[] = [
  'critico',
  'urgente',
  'atencion',
  'ok',
  'sin-consumo',
];

export function etiquetaEstado(estado: EstadoAbastecimiento): string {
  return ESTILOS[estado].etiqueta;
}
