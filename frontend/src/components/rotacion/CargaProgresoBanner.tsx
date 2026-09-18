import { Loader2 } from 'lucide-react';

interface GenericProgress {
  paginaActual: number;
  totalPaginas: number;
  /** Nombre de la unidad que se está cargando (materiales, productos, etc.) — para el texto y el conteo final. */
  totalUnidades: number;
}

interface Props {
  progress: GenericProgress | null;
  titulo?: string;
  descripcion?: string;
  unidadLabel?: string;
}

export function CargaProgresoBanner({
  progress,
  titulo = 'Cargando catálogo completo de rotación…',
  descripcion = 'Es una consulta pesada sobre miles de materiales; solo ocurre una vez (se guarda en este navegador por 24h).',
  unidadLabel = 'materiales',
}: Props) {
  const pct = progress && progress.totalPaginas > 0 ? Math.round((progress.paginaActual / progress.totalPaginas) * 100) : 0;

  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <Loader2 size={28} className="animate-spin text-brand-600" />
      <div>
        <p className="text-sm font-medium text-slate-700">{titulo}</p>
        <p className="mt-1 text-xs text-slate-400">{descripcion}</p>
      </div>
      {progress && (
        <div className="w-full max-w-sm">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Página {progress.paginaActual} de {progress.totalPaginas} · {progress.totalUnidades.toLocaleString('es-PE')}{' '}
            {unidadLabel} en total
          </p>
        </div>
      )}
    </div>
  );
}
