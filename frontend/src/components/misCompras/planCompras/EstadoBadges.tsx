import type { EstadoMaterialPlan, TandaCompra } from '@/types/planCompras';

const ESTADO_CONFIG: Record<EstadoMaterialPlan, { dot: string; label: string; classes: string }> = {
  atendido: { dot: '🟢', label: 'Atendido / Tiene OC', classes: 'bg-emerald-50 text-emerald-700' },
  parcial: { dot: '🟡', label: 'Parcialmente atendido', classes: 'bg-amber-50 text-amber-700' },
  pendiente: { dot: '🔴', label: 'Pendiente de OC', classes: 'bg-rose-50 text-rose-700' },
  consolidable: { dot: '🔵', label: 'Consolidable', classes: 'bg-sky-50 text-sky-700' },
};

export function EstadoMaterialBadge({ estado }: { estado: EstadoMaterialPlan }) {
  const cfg = ESTADO_CONFIG[estado];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.classes}`}>
      <span aria-hidden>{cfg.dot}</span> {cfg.label}
    </span>
  );
}

const TANDA_CONFIG: Record<TandaCompra, { label: string; classes: string }> = {
  urgente: { label: '⚠️ Cuanto antes (30+ días esperando)', classes: 'bg-rose-50 text-rose-700' },
  programada: { label: '📅 Programada', classes: 'bg-slate-100 text-slate-600' },
};

export function TandaBadge({ tanda }: { tanda: TandaCompra }) {
  const cfg = TANDA_CONFIG[tanda];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${cfg.classes}`}>{cfg.label}</span>;
}
