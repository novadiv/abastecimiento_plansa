import type { RotacionNivel } from '@/types/rotacion';

const CONFIG: Record<RotacionNivel, { dot: string; label: string; classes: string }> = {
  alta: { dot: '🔴', label: 'Alta', classes: 'bg-rose-50 text-rose-700' },
  media: { dot: '🟡', label: 'Media', classes: 'bg-amber-50 text-amber-700' },
  baja: { dot: '⚪', label: 'Baja', classes: 'bg-slate-100 text-slate-600' },
  sinRotacion: { dot: '⚫', label: 'Sin rotación', classes: 'bg-slate-200 text-slate-700' },
};

export function NivelBadge({ nivel }: { nivel: RotacionNivel }) {
  const cfg = CONFIG[nivel];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.classes}`}>
      <span aria-hidden>{cfg.dot}</span> {cfg.label}
    </span>
  );
}

export function EstacionalBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
      <span aria-hidden>📅</span> Estacional
    </span>
  );
}
