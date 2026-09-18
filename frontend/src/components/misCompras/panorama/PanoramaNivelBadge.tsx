import type { PanoramaNivel, PanoramaRecomendacion } from '@/types/panorama';

const NIVEL_CONFIG: Record<PanoramaNivel, { dot: string; label: string; classes: string }> = {
  alta: { dot: '🔴', label: 'Alta rotación', classes: 'bg-rose-50 text-rose-700' },
  media: { dot: '🟠', label: 'Media rotación', classes: 'bg-amber-50 text-amber-700' },
  estacional: { dot: '🔵', label: 'Estacional', classes: 'bg-sky-50 text-sky-700' },
  baja: { dot: '🟢', label: 'Baja/poca rotación', classes: 'bg-emerald-50 text-emerald-700' },
};

export function PanoramaNivelBadge({ nivel }: { nivel: PanoramaNivel }) {
  const cfg = NIVEL_CONFIG[nivel];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.classes}`}>
      <span aria-hidden>{cfg.dot}</span> {cfg.label}
    </span>
  );
}

const RECOMENDACION_CLASSES: Record<PanoramaRecomendacion, string> = {
  'COMPRAR AHORA': 'bg-rose-600 text-white',
  PROGRAMAR: 'bg-amber-100 text-amber-800',
  'REVISAR TEMPORADA': 'bg-sky-100 text-sky-800',
  'NO ABASTECER': 'bg-slate-100 text-slate-500',
};

export function PanoramaRecomendacionBadge({ recomendacion }: { recomendacion: PanoramaRecomendacion }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${RECOMENDACION_CLASSES[recomendacion]}`}>
      {recomendacion}
    </span>
  );
}
